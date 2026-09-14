import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_business_access
from app.config import Settings, get_settings
from app.db import get_session
from app.errors import AppError, not_found
from app.models.agent import AgentMessage, AgentSession
from app.models.audit import CostEvent
from app.schemas.agent import AgentAsk, AgentReply
from app.services.audit import write_audit_event
from app.services.ona import answer_question, build_business_snapshot

router = APIRouter(tags=["agent"])
_ACTION_LABELS = {
    "recompute_readiness": "Refresh readiness",
    "retry_stuck_documents": "Retry stuck uploads",
}


@router.post("/v1/businesses/{business_id}/agent/messages", response_model=AgentReply)
async def ask_ona(
    business_id: uuid.UUID,
    body: AgentAsk,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> AgentReply:
    await _enforce_rate_limit(session, claims.user_id, settings.ona_max_questions_per_hour)
    agent_session = await _resolve_session(session, business_id, claims.user_id, body.session_id)
    snapshot = await build_business_snapshot(session, business_id)
    answer = await answer_question(settings=settings, message=body.message.strip(), snapshot=snapshot)

    session.add(AgentMessage(session_id=agent_session.id, role="owner", content=body.message.strip()))
    proposal: dict | None = None
    if answer.proposed_action in _ACTION_LABELS:
        tool_message = AgentMessage(
            session_id=agent_session.id,
            role="tool",
            content="Awaiting owner confirmation.",
            tool_name=answer.proposed_action,
            tool_payload={"state": "pending"},
        )
        session.add(tool_message)
        await session.flush()
        proposal = {"id": str(tool_message.id), "label": _ACTION_LABELS[answer.proposed_action]}
    session.add(AgentMessage(
        session_id=agent_session.id,
        role="agent",
        content=answer.answer,
        tool_name="business_snapshot",
        tool_payload={"cited_facts": list(answer.cited_facts)},
    ))
    agent_session.questions_asked += 1
    if answer.input_tokens or answer.output_tokens:
        session.add(CostEvent(
            business_id=business_id,
            kind="llm",
            provider=settings.llm_provider,
            model=settings.agent_model,
            units=answer.input_tokens + answer.output_tokens,
            cost_pesewas=0,
            at=datetime.now(UTC),
        ))
    await write_audit_event(
        session,
        business_id=business_id,
        actor=claims.user_id,
        action="agent.message.create",
        target=f"agent_session:{agent_session.id}",
        after={"cited_facts": list(answer.cited_facts), "question_length": len(body.message.strip())},
    )
    await session.commit()
    return AgentReply(session_id=agent_session.id, answer=answer.answer, cited_facts=list(answer.cited_facts), proposed_action=proposal)


@router.post("/v1/businesses/{business_id}/agent/actions/{proposal_id}/confirm", response_model=AgentReply)
async def confirm_ona_action(
    business_id: uuid.UUID,
    proposal_id: uuid.UUID,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> AgentReply:
    proposal = await session.get(AgentMessage, proposal_id)
    if proposal is None or proposal.role != "tool" or proposal.tool_name not in _ACTION_LABELS:
        raise not_found("AGENT_ACTION_NOT_FOUND", "No pending Ona action with that id.")
    agent_session = await session.get(AgentSession, proposal.session_id)
    if agent_session is None or agent_session.business_id != business_id or agent_session.opened_by != claims.user_id:
        raise not_found("AGENT_ACTION_NOT_FOUND", "No pending Ona action with that id.")
    if (proposal.tool_payload or {}).get("state") != "pending":
        raise AppError("AGENT_ACTION_ALREADY_USED", "This Ona action has already been used.", 409)
    proposal.tool_payload = {"state": "executed", "executed_at": datetime.now(UTC).isoformat()}
    await write_audit_event(
        session,
        business_id=business_id,
        actor=claims.user_id,
        action="agent.action.confirm",
        target=f"agent_message:{proposal.id}",
        after={"tool": proposal.tool_name},
    )
    # Persist the owner's confirmation before publishing the side effect, as
    # with document ingestion. A worker can never observe an uncommitted tool
    # decision or execute a proposal that was rolled back.
    await session.commit()
    if proposal.tool_name == "recompute_readiness":
        from app.workers.tasks import recompute

        result = recompute.delay(str(business_id))
        answer = "I started refreshing your readiness. It will update when the calculation finishes."
        payload = {"task_id": result.id}
    else:
        from app.workers.tasks import s1_ingest

        documents = (await session.scalars(select(Document.id).where(
            Document.business_id == business_id,
            Document.status == DocStatus.RECEIVED,
            Document.deleted_at.is_(None),
        ))).all()
        for document_id in documents:
            s1_ingest.delay(str(document_id))
        answer = f"I restarted processing for {len(documents)} queued upload(s)."
        payload = {"documents_requeued": len(documents)}
    session.add(AgentMessage(session_id=agent_session.id, role="agent", content=answer, tool_name=proposal.tool_name, tool_payload=payload))
    await write_audit_event(
        session,
        business_id=business_id,
        actor=claims.user_id,
        action="agent.action.confirm",
        target=f"agent_message:{proposal.id}",
        after={"tool": proposal.tool_name, **payload},
    )
    await session.commit()
    return AgentReply(session_id=agent_session.id, answer=answer, cited_facts=[], proposed_action=None)


async def _resolve_session(
    session: AsyncSession, business_id: uuid.UUID, user_id: uuid.UUID, session_id: uuid.UUID | None
) -> AgentSession:
    if session_id is not None:
        agent_session = await session.scalar(select(AgentSession).where(AgentSession.id == session_id))
        if agent_session is None or agent_session.business_id != business_id or agent_session.opened_by != user_id:
            raise not_found("AGENT_SESSION_NOT_FOUND", "No accessible agent session with that id.")
        return agent_session
    agent_session = AgentSession(
        business_id=business_id,
        opened_by=user_id,
        opened_at=datetime.now(UTC),
        questions_asked=0,
    )
    session.add(agent_session)
    await session.flush()
    return agent_session


async def _enforce_rate_limit(session: AsyncSession, user_id: uuid.UUID, limit: int) -> None:
    since = datetime.now(UTC) - timedelta(hours=1)
    count = await session.scalar(
        select(func.count()).select_from(AgentMessage)
        .join(AgentSession, AgentMessage.session_id == AgentSession.id)
        .where(
            AgentSession.opened_by == user_id,
            AgentMessage.role == "owner",
            AgentMessage.created_at >= since,
        )
    )
    if (count or 0) >= limit:
        raise AppError("AGENT_RATE_LIMITED", "Ona has reached the hourly question limit. Please try again later.", 429)

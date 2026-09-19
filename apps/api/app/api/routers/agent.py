import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Claims, require_business_access
from app.config import Settings, get_settings
from app.db import get_session
from app.errors import AppError, not_found
from app.models.agent import AgentMessage, AgentSession
from app.models.audit import CostEvent
from app.models.document import Document
from app.models.enums import DocStatus
from app.schemas.agent import (
    AgentAsk,
    AgentReply,
    AgentSessionDetail,
    AgentSessionList,
    AgentSessionMessage,
    AgentSessionSummary,
)
from app.services.audit import write_audit_event
from app.services.ona import HistoryTurn, answer_question, build_business_snapshot

router = APIRouter(tags=["agent"])
_ACTION_LABELS = {
    "recompute_readiness": "Refresh readiness",
    "retry_stuck_documents": "Retry stuck uploads",
}
_ONA_ERROR_STATUS = {
    "ONA_RATE_LIMITED": 429,
    "ONA_UNAVAILABLE": 503,
    "ONA_UPSTREAM_AUTH": 502,
    "ONA_UPSTREAM_NOT_FOUND": 502,
    "ONA_UPSTREAM_ERROR": 502,
}


@router.get("/v1/businesses/{business_id}/agent/sessions", response_model=AgentSessionList)
async def list_agent_sessions(
    business_id: uuid.UUID,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> AgentSessionList:
    sessions = (
        await session.scalars(
            select(AgentSession)
            .where(AgentSession.business_id == business_id, AgentSession.opened_by == claims.user_id)
            .order_by(AgentSession.opened_at.desc())
            .limit(50)
        )
    ).all()
    items: list[AgentSessionSummary] = []
    for agent_session in sessions:
        first_message = await session.scalar(
            select(AgentMessage.content)
            .where(AgentMessage.session_id == agent_session.id, AgentMessage.role == "owner")
            .order_by(AgentMessage.created_at.asc())
            .limit(1)
        )
        message_count = await session.scalar(
            select(func.count())
            .select_from(AgentMessage)
            .where(
                AgentMessage.session_id == agent_session.id,
                AgentMessage.role.in_(("owner", "agent")),
            )
        )
        preview = (first_message or "New chat").strip()
        items.append(
            AgentSessionSummary(
                id=agent_session.id,
                opened_at=agent_session.opened_at,
                preview=preview[:80],
                message_count=int(message_count or 0),
            )
        )
    return AgentSessionList(items=items)


@router.get(
    "/v1/businesses/{business_id}/agent/sessions/{session_id}",
    response_model=AgentSessionDetail,
)
async def get_agent_session(
    business_id: uuid.UUID,
    session_id: uuid.UUID,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> AgentSessionDetail:
    agent_session = await _accessible_session(session, business_id, claims.user_id, session_id)
    rows = (
        await session.scalars(
            select(AgentMessage)
            .where(AgentMessage.session_id == agent_session.id, AgentMessage.role.in_(("owner", "agent")))
            .order_by(AgentMessage.created_at.asc())
        )
    ).all()
    return AgentSessionDetail(
        id=agent_session.id,
        opened_at=agent_session.opened_at,
        messages=[
            AgentSessionMessage(
                id=row.id,
                role=row.role,
                content=row.content,
                created_at=row.created_at,
            )
            for row in rows
        ],
    )


@router.delete("/v1/businesses/{business_id}/agent/sessions/{session_id}", status_code=204)
async def delete_agent_session(
    business_id: uuid.UUID,
    session_id: uuid.UUID,
    claims: Claims = Depends(require_business_access),
    session: AsyncSession = Depends(get_session),
) -> Response:
    agent_session = await _accessible_session(session, business_id, claims.user_id, session_id)
    await session.execute(delete(AgentMessage).where(AgentMessage.session_id == agent_session.id))
    await session.delete(agent_session)
    await write_audit_event(
        session,
        business_id=business_id,
        actor=claims.user_id,
        action="agent.session.delete",
        target=f"agent_session:{agent_session.id}",
    )
    await session.commit()
    return Response(status_code=204)


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
    history = await _session_history(session, agent_session.id)
    snapshot = await build_business_snapshot(session, business_id)
    answer = await answer_question(
        settings=settings,
        session=session,
        business_id=business_id,
        message=body.message.strip(),
        snapshot=snapshot,
        history=history,
    )
    if answer.error:
        code = answer.error_code or "ONA_UPSTREAM_ERROR"
        raise AppError(code, answer.answer, _ONA_ERROR_STATUS.get(code, 502))

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
    return AgentReply(
        session_id=agent_session.id,
        answer=answer.answer,
        cited_facts=list(answer.cited_facts),
        proposed_action=proposal,
        used_tools=list(answer.used_tools),
    )


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


async def _session_history(session: AsyncSession, session_id: uuid.UUID) -> list[HistoryTurn]:
    rows = (
        await session.scalars(
            select(AgentMessage)
            .where(AgentMessage.session_id == session_id, AgentMessage.role.in_(("owner", "agent")))
            .order_by(AgentMessage.created_at.asc())
        )
    ).all()
    return [HistoryTurn(role=row.role, content=row.content) for row in rows]


async def _accessible_session(
    session: AsyncSession, business_id: uuid.UUID, user_id: uuid.UUID, session_id: uuid.UUID
) -> AgentSession:
    agent_session = await session.scalar(select(AgentSession).where(AgentSession.id == session_id))
    if agent_session is None or agent_session.business_id != business_id or agent_session.opened_by != user_id:
        raise not_found("AGENT_SESSION_NOT_FOUND", "No accessible agent session with that id.")
    return agent_session


async def _resolve_session(
    session: AsyncSession, business_id: uuid.UUID, user_id: uuid.UUID, session_id: uuid.UUID | None
) -> AgentSession:
    if session_id is not None:
        return await _accessible_session(session, business_id, user_id, session_id)
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

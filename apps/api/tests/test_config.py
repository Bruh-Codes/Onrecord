from app.config import Settings


def test_groq_uses_openai_compatible_responses_endpoint_and_key():
    settings = Settings(
        llm_provider="groq",
        groq_api_key="groq-secret",
        financial_mapping_model="llama-3.3-70b-versatile",
    )

    assert settings.llm_api_key == "groq-secret"
    assert settings.responses_api_url == "https://api.groq.com/openai/v1/responses"
    assert settings.responses_options() == {}


def test_openai_keeps_privacy_and_reasoning_options():
    settings = Settings(openai_api_key="openai-secret")

    assert settings.llm_api_key == "openai-secret"
    assert settings.responses_options() == {"store": False, "reasoning": {"effort": "low"}}


def test_groq_gpt_oss_ona_uses_medium_reasoning():
    settings = Settings(
        llm_provider="groq",
        groq_api_key="groq-secret",
        ona_model="openai/gpt-oss-120b",
        financial_mapping_model="llama-3.3-70b-versatile",
    )

    assert settings.ona_responses_options() == {"reasoning": {"effort": "medium"}}

from app.services.ona_web import needs_web_search, search_queries_for


def test_needs_web_for_general_sme_question():
    assert needs_web_search("I want to start a new business in Ghana, what should I do?")


def test_skips_web_for_platform_score_question():
    assert not needs_web_search("What is my readiness score and open gaps?")


def test_skips_web_for_personal_spending_question():
    assert not needs_web_search("What are the things I spend money on a lot?")


def test_skips_web_for_document_question():
    assert not needs_web_search("What documents have I uploaded?")


def test_search_queries_add_ghana_context():
    queries = search_queries_for("How do I register a sole proprietorship?")
    assert queries[0].startswith("How do I register")
    assert "Ghana SME" in queries[1]

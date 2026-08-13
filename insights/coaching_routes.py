"""
coaching_routes.py — view coaching plans and the winning-patterns library.

Mount in main.py with:
    from coaching_routes import router as coaching_router
    app.include_router(coaching_router)
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session, Agent

from auth import get_current_agent
from datetime import date
from db_coaching import CoachingPlan, WinningPattern, DailyQuiz, QuizQuestion  # extend existing import
router = APIRouter(prefix="/coaching", tags=["Coaching"])


@router.get("/plan")
async def get_latest_plan(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    result = await db.execute(
        select(CoachingPlan)
        .where(CoachingPlan.agent_id == agent.id)
        .order_by(CoachingPlan.generated_at.desc())
        .limit(1)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        return {"plan": None}

    if not plan.is_read:
        plan.is_read = True
        await db.commit()

    return {
        "plan": {
            "id": plan.id,
            "generated_at": plan.generated_at,
            "period_start": plan.period_start,
            "period_end": plan.period_end,
            "meetings_analyzed": plan.meetings_analyzed,
            "avg_coaching_score": plan.avg_coaching_score,
            "plan_text": plan.plan_text,
        }
    }


@router.get("/plans")
async def get_plan_history(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    result = await db.execute(
        select(CoachingPlan)
        .where(CoachingPlan.agent_id == agent.id)
        .order_by(CoachingPlan.generated_at.desc())
        .limit(20)
    )
    plans = result.scalars().all()
    return {
        "plans": [
            {
                "id": p.id,
                "generated_at": p.generated_at,
                "meetings_analyzed": p.meetings_analyzed,
                "avg_coaching_score": p.avg_coaching_score,
                "plan_text": p.plan_text,
                "is_read": p.is_read,
            }
            for p in plans
        ]
    }


@router.get("/winning-patterns")
async def get_winning_patterns(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    owner_scope_id = agent.org_id or agent.id
    result = await db.execute(
        select(WinningPattern)
        .where(WinningPattern.owner_scope_id == owner_scope_id)
        .order_by(WinningPattern.created_at.desc())
        .limit(20)
    )
    patterns = result.scalars().all()

    agent_ids = {p.source_agent_id for p in patterns}
    agents_result = await db.execute(select(Agent).where(Agent.id.in_(agent_ids)))
    names_by_id = {a.id: a.name for a in agents_result.scalars().all()}

    return {
        "patterns": [
            {
                "id": p.id,
                "category": p.category,
                "technique": p.technique,
                "source_agent_name": names_by_id.get(p.source_agent_id, "A teammate"),
                "source_meeting_id": p.source_meeting_id,
                "created_at": p.created_at,
            }
            for p in patterns
        ]
    }

def _question_out(q: QuizQuestion, reveal: bool) -> dict:
    out = {
        "id": q.id,
        "position": q.position,
        "scenario": q.scenario,
        "options": q.options,
        "skill_area": q.skill_area,
        "selected_index": q.selected_index,
        "is_correct": q.is_correct,
    }
    if reveal:
        out["correct_index"] = q.correct_index
        out["explanation"] = q.explanation
    return out


@router.get("/quiz/today")
async def get_today_quiz(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    result = await db.execute(
        select(DailyQuiz).where(DailyQuiz.agent_id == agent.id, DailyQuiz.quiz_date == date.today())
    )
    quiz = result.scalar_one_or_none()
    if not quiz:
        return {"quiz": None}

    q_result = await db.execute(
        select(QuizQuestion).where(QuizQuestion.quiz_id == quiz.id).order_by(QuizQuestion.position)
    )
    questions = q_result.scalars().all()

    return {
        "quiz": {
            "id": quiz.id,
            "quiz_date": quiz.quiz_date,
            "based_on": quiz.based_on_gap_summary,
            "questions": [_question_out(q, reveal=q.selected_index is not None) for q in questions],
        }
    }


@router.post("/quiz/{quiz_id}/questions/{question_id}/answer")
async def answer_quiz_question(
    quiz_id: str,
    question_id: str,
    selected_index: int,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    result = await db.execute(
        select(QuizQuestion)
        .join(DailyQuiz, DailyQuiz.id == QuizQuestion.quiz_id)
        .where(
            QuizQuestion.id == question_id,
            QuizQuestion.quiz_id == quiz_id,
            DailyQuiz.agent_id == agent.id,
        )
    )
    question = result.scalar_one_or_none()
    if not question:
        return {"error": "Question not found"}, 404

    if question.selected_index is not None:
        return {"question": _question_out(question, reveal=True)}

    if not (0 <= selected_index <= 3):
        return {"error": "selected_index must be 0-3"}, 400

    question.selected_index = selected_index
    question.is_correct = (selected_index == question.correct_index)
    question.answered_at = datetime.utcnow()
    await db.commit()

    return {"question": _question_out(question, reveal=True)}


@router.get("/quiz/history")
async def get_quiz_history(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_session)
):
    result = await db.execute(
        select(DailyQuiz)
        .where(DailyQuiz.agent_id == agent.id)
        .order_by(DailyQuiz.quiz_date.desc())
        .limit(14)
    )
    quizzes = result.scalars().all()

    out = []
    for quiz in quizzes:
        q_result = await db.execute(select(QuizQuestion).where(QuizQuestion.quiz_id == quiz.id))
        questions = q_result.scalars().all()
        answered = [q for q in questions if q.selected_index is not None]
        correct = [q for q in answered if q.is_correct]
        out.append({
            "id": quiz.id,
            "quiz_date": quiz.quiz_date,
            "total_questions": len(questions),
            "answered": len(answered),
            "correct": len(correct),
        })
    return {"history": out}
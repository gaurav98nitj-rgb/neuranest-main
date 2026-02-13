import csv
import io
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, Topic, Score
from app.dependencies import require_pro

router = APIRouter(prefix="/exports", tags=["exports"])


@router.get("/topics.csv")
async def export_topics_csv(
    category: Optional[str] = None,
    stage: Optional[str] = None,
    min_score: Optional[float] = None,
    user: User = Depends(require_pro()),
    db: AsyncSession = Depends(get_db),
):
    query = select(Topic).where(Topic.is_active == True)

    if category:
        query = query.where(Topic.primary_category == category)
    if stage:
        query = query.where(Topic.stage == stage)

    query = query.order_by(Topic.name)
    result = await db.execute(query)
    topics = result.scalars().all()

    # Build CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Topic", "Slug", "Stage", "Category",
        "Opportunity Score", "Competition Index",
        "Demand Score", "Review Gap Score",
    ])

    for topic in topics:
        scores = {}
        for score_type in ["opportunity", "competition", "demand", "review_gap"]:
            score_result = await db.execute(
                select(Score)
                .where(and_(Score.topic_id == topic.id, Score.score_type == score_type))
                .order_by(desc(Score.computed_at))
                .limit(1)
            )
            s = score_result.scalar_one_or_none()
            scores[score_type] = float(s.score_value) if s else ""

        if min_score and scores.get("opportunity") and scores["opportunity"] < min_score:
            continue

        writer.writerow([
            topic.name, topic.slug, topic.stage, topic.primary_category or "",
            scores.get("opportunity", ""),
            scores.get("competition", ""),
            scores.get("demand", ""),
            scores.get("review_gap", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=neuranest_topics_export.csv"},
    )

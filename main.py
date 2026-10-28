
from contextlib import asynccontextmanager
from pathlib import Path
import json
import sqlite3

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DB_PATH = Path(__file__).with_name("ecotrack.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def create_database():
    with get_connection() as conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            quantity REAL NOT NULL,
            unit TEXT NOT NULL,
            estimated_kg_co2e REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            entry_json TEXT
        )
        """)

        # Add the new column to an existing database if needed.
        columns = {
            row["name"]
            for row in conn.execute(
                "PRAGMA table_info(activities)"
            ).fetchall()
        }

        if "entry_json" not in columns:
            conn.execute(
                "ALTER TABLE activities ADD COLUMN entry_json TEXT"
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_database()
    yield


app = FastAPI(title="EcoTrack API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Activity(BaseModel):
    name: str = Field(min_length=1)
    category: str = Field(min_length=1)
    quantity: float = Field(gt=0)
    unit: str = Field(min_length=1)
    estimated_kg_co2e: float | None = None
    entry_json: dict | None = None


@app.get("/")
def home():
    return {"message": "EcoTrack backend is running!"}


@app.get("/activities")
def get_activities():
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM activities ORDER BY id DESC"
        ).fetchall()

    return [dict(row) for row in rows]


@app.post("/activities")
def add_activity(activity: Activity):
    with get_connection() as conn:
        cursor = conn.execute("""
        INSERT INTO activities
        (name, category, quantity, unit,
         estimated_kg_co2e, entry_json)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            activity.name,
            activity.category,
            activity.quantity,
            activity.unit,
            activity.estimated_kg_co2e,
            json.dumps(activity.entry_json)
            if activity.entry_json is not None else None
        ))

        activity_id = cursor.lastrowid

        row = conn.execute(
            "SELECT * FROM activities WHERE id = ?",
            (activity_id,)
        ).fetchone()

    return dict(row)

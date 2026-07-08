# Assessment Test Engine MVP

A robust, student-facing web assessment platform designed for modularity and ease of deployment. This MVP supports both local-only demo modes and a full PostgreSQL-backed production environment.

## 🚀 Overview

The Assessment Test Engine provides a comprehensive environment for students to take multiple-choice question (MCQ) assessments. It includes features like question navigation, embedded images, and supporting tools (calculator, scratch pad). For administrators, it offers a dashboard for result analysis and Individualized Learning Plan (ILP) generation.

### Key Features

- **Rich Assessment UI**: Support for MCQ questions with embedded question and option images.
- **Student Tools**: Integrated calculator and scratch pad for use during assessments.
- **Secure Environment**: Silent copy/selection friction to discourage cheating.
- **Dual Data Modes**:
  - **Local Mode**: Uses browser `localStorage` and `IndexedDB` for instant demos without a backend.
  - **API Mode**: Connects to a Node.js backend with PostgreSQL for persistent, multi-user storage.
- **Submission & Scoring**: Automated evaluation of submissions and server-side scoring (in production).
- **Admin Dashboard**: Tools for managing assessments, viewing student results, and generating ILPs.

---

## 🛠 Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3.
- **Backend**: Node.js (using the native `http` module for minimal dependencies).
- **Database**: PostgreSQL (compatible with Neon and local instances).
- **Dependencies**: `pg` (PostgreSQL client for Node.js).

---

## 📂 Project Structure

```text
├── api/                # Production Node.js API (PostgreSQL backend)
├── data/               # Local data storage (if any)
├── database/           # SQL schema definitions and database views
├── input/              # Static assessment JSON files and assets (images)
├── scripts/            # Utility scripts (seeding, syncing, doc conversion)
├── src/                # Frontend source code
│   ├── admin/          # Admin-specific logic and UI
│   ├── student/        # Student exam and dashboard logic
│   ├── app.js          # Main application entry point
│   ├── config.js       # App configuration (API endpoints, data provider)
│   └── styles.css      # Core application styling
├── index.html          # Main HTML entry point
├── server.js           # Local development server and integrated API
└── package.json        # Node.js project metadata and scripts
```

---

## 🏁 Getting Started

### Prerequisites

- Node.js (version 20 or higher recommended)
- A PostgreSQL database (for API mode)

### 1. Installation

Clone the repository and install dependencies:

```bash
npm install
```

### 2. Local Development (Frontend + Integrated API)

The `server.js` file provides a convenient development server that also includes an integrated version of the API.

```bash
npm run dev
```
- **Student View**: `http://localhost:5173/`
- **Admin Dashboard**: `http://localhost:5173/?admin=1`

### 3. Running the Dedicated Production API

For production environments, use the dedicated API entry point:

```bash
# Set environment variables
export DATABASE_URL="postgres://user:password@host:5432/database"
export STUDENT_VIEW="test_engine_registered_students"

npm run api
```

---

## ⚙️ Configuration

The frontend configuration is managed in `src/config.js`. You can switch between `local` and `api` providers:

```javascript
// src/config.js
window.ASSESSMENT_DATA_PROVIDER = "api"; // or "local"
window.ASSESSMENT_API_BASE_URL = "http://127.0.0.1:9000";
```

For live testing with a hosted backend (e.g., Render), update `ASSESSMENT_API_BASE_URL` to your service URL.

---

## 🗄 Database Setup

1. **Initialize Schema**: Run the SQL scripts in the `database/` directory against your PostgreSQL instance:
   - `postgres-schema.sql`: Core tables for assessments, attempts, and assignments.
   - `student-registration-view.sql`: Creates the student view required by the API.

2. **Seed Data**: Use the provided scripts to populate your database:
   - `npm run seed:pretests`: Seed pre-test assessments from `input/`.
   - `npm run sync:students`: Sync student data to a remote (e.g., Neon) database.

---

## 🚢 Deployment

### Frontend (GitHub Pages)
The frontend is a static site and can be hosted on GitHub Pages or any static file host. Ensure `src/config.js` points to your live API.

### Backend (Render)
A `render.yaml` file is included for easy deployment to Render. Required environment variables:
- `DATABASE_URL`: Your PostgreSQL connection string.
- `STUDENT_VIEW`: Name of the student view (e.g., `test_engine_registered_students`).
- `CORS_ORIGIN`: Your frontend URL.

---

## 📝 Assessment Input

Assessments are currently loaded from JSON files in `input/pre-test-for-demo.json`. Assets such as images should be placed in `input/assets/pre-test-for-demo/`.

Refer to `DATA_SOURCE_NOTES.md` for details on the question format and the roadmap for moving questions into the database.

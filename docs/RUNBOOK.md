# SMBFlow Local Runbook

This document outlines the step-by-step process for starting the full SMBFlow application stack locally for development and testing.

## Prerequisites
- Docker & Docker Compose
- Python 3.10+
- Node.js 18+ & npm

---

## 1. Start the Database Infrastructure
The backend relies on PostgreSQL for relational data and vector storage, and Redis for caching and background tasks.

From the root of the repository, start the Docker containers in detached mode:
```powershell
docker-compose up -d
```
*Note: Ensure PostgreSQL is running on port 5432 and Redis on 6379, as defined in your configuration.*

## 2. Start the FastAPI Backend
The backend provides the API, orchestration engine, and database interactions.

Open a terminal at the root of the repository (`C:\Users\lakha\ml_cp\SMBFlow`) and run:
```powershell
python main.py api
```
*This starts the Uvicorn server on `http://127.0.0.1:8000` with hot-reloading enabled.*

## 3. Start the React Frontend
The frontend provides the user interface, including the new Figma-faithful Home Dashboard.

Open a **second terminal window**, navigate to the frontend directory, and start the Vite development server:
```powershell
cd frontend
npm run dev
```
*This starts the frontend development server on `http://localhost:5173`.*

## 4. Access the Application
1. Open your web browser and navigate to the authentication page:
   [http://localhost:5173/auth](http://localhost:5173/auth)
2. Log in using the default super admin credentials (seeded in `db/init.sql`):
   - **Email:** `admin@smbflow.com`
   - **Password:** `admin123`
3. Upon successful login, you will be redirected to the `/dashboard`.

---

## Troubleshooting
- **Backend crash on startup:** Ensure `docker-compose up -d` has fully initialized the database before starting the backend.
- **Port conflicts:** Make sure ports `8000` (FastAPI), `5173` (Vite), `5432` (Postgres), and `6379` (Redis) are not occupied by other applications.
- **Data not loading:** Verify your `.env` file is properly configured to point to the local Docker containers.

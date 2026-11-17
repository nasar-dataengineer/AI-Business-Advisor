# AI-Business-Advisor

This project is organized into the following layers:

- `data` for datasets and ETL assets
- `model` for AI/ML models and training artifacts
- `backend` for API and business logic
- `frontend` for web UI
- `mobile` for mobile app code
- `docs` for product and technical documentation

## Structure

```text
AI-Business-Advisor/
├── data/
├── model/
├── backend/
├── frontend/
├── mobile/
├── docs/
└── README.md
```

## Run the application

On Windows, run `START.bat` from the project directory. It starts the FastAPI
backend at `http://127.0.0.1:8000` and the Vite frontend at
`http://127.0.0.1:5173`. Open the frontend URL in a browser.

You can also start the frontend alone by running `npm run dev` in `frontend`.
Vite starts the backend automatically if it is not already running, and stops
the backend it started when the frontend server shuts down.

The frontend sends API requests to `/api`; Vite proxies those requests to the
backend during development. To use a different backend address, set
`API_PROXY_TARGET` before starting Vite. For a frontend deployment without the
Vite development proxy, set `VITE_API_URL` to the API base URL when building
the frontend.

Clicking a location inside a KPK district automatically sends an analysis
request to the backend using the current budget. The Analyze button can be used
to run the analysis again after changing the budget. The frontend displays the
backend connection status and checks it again every 15 seconds.

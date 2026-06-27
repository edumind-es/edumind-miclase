#!/usr/bin/env bash
set -e

echo "Iniciando EDUmind MiClase en modo desarrollo…"
echo "Backend:  http://127.0.0.1:3270"
echo "Frontend: http://127.0.0.1:5173"
echo ""

# Backend en background
(cd backend && node src/index.js) &
BACKEND_PID=$!

# Frontend con Vite
(cd frontend && npm run dev) &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT INT TERM
wait

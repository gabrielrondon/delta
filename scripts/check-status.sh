#!/bin/bash

# ============================================================================
# Delta Platform - Status Check Script
# ============================================================================

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║   Δ Delta - Platform Status Check                           ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check functions
check_bun() {
    echo -n "Checking Bun... "
    if command -v bun &> /dev/null; then
        VERSION=$(bun --version)
        echo -e "${GREEN}✓${NC} (v${VERSION})"
    else
        echo -e "${RED}✗ Not installed${NC}"
        echo "  Install from: https://bun.sh"
        exit 1
    fi
}

check_docker() {
    echo -n "Checking Docker... "
    if command -v docker &> /dev/null; then
        VERSION=$(docker --version | cut -d' ' -f3 | cut -d',' -f1)
        echo -e "${GREEN}✓${NC} (v${VERSION})"
    else
        echo -e "${RED}✗ Not installed${NC}"
        echo "  Install from: https://docker.com"
        exit 1
    fi
}

check_docker_compose() {
    echo -n "Checking Docker Compose... "
    if docker compose version &> /dev/null; then
        VERSION=$(docker compose version --short)
        echo -e "${GREEN}✓${NC} (v${VERSION})"
    else
        echo -e "${RED}✗ Not installed${NC}"
        exit 1
    fi
}

check_dependencies() {
    echo -n "Checking Node modules... "
    if [ -d "node_modules" ]; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}⚠ Not installed${NC}"
        echo "  Run: bun install"
    fi
}

check_env() {
    echo -n "Checking .env file... "
    if [ -f ".env" ]; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}⚠ Not found${NC}"
        echo "  Run: cp .env.example .env"
    fi
}

check_timescaledb() {
    echo -n "Checking TimescaleDB... "
    if docker compose ps timescaledb 2>/dev/null | grep -q "Up"; then
        echo -e "${GREEN}✓ Running${NC}"
    else
        echo -e "${RED}✗ Not running${NC}"
        echo "  Run: docker compose up -d timescaledb"
    fi
}

check_redis() {
    echo -n "Checking Redis... "
    if docker compose ps redis 2>/dev/null | grep -q "Up"; then
        echo -e "${GREEN}✓ Running${NC}"
    else
        echo -e "${RED}✗ Not running${NC}"
        echo "  Run: docker compose up -d redis"
    fi
}

check_api() {
    echo -n "Checking API Server... "
    if curl -s http://localhost:3000/health &> /dev/null; then
        echo -e "${GREEN}✓ Running${NC}"
    else
        echo -e "${RED}✗ Not running${NC}"
        echo "  Run: bun run dev"
    fi
}

check_database_schema() {
    echo -n "Checking Database Schema... "
    if [ -f "src/db/schema.sql" ]; then
        echo -e "${GREEN}✓${NC}"
        # Try to check if migrations are run
        if docker compose ps timescaledb 2>/dev/null | grep -q "Up"; then
            if docker compose exec -T timescaledb psql -U delta -d delta -c "SELECT 1 FROM projects LIMIT 0" &> /dev/null; then
                echo -e "  ${GREEN}✓ Migrations applied${NC}"
            else
                echo -e "  ${YELLOW}⚠ Migrations not applied${NC}"
                echo "    Run: bun run db:migrate"
            fi
        fi
    else
        echo -e "${RED}✗ Not found${NC}"
    fi
}

# Main checks
echo "Prerequisites:"
check_bun
check_docker
check_docker_compose
echo ""

echo "Project Setup:"
check_dependencies
check_env
check_database_schema
echo ""

echo "Services:"
check_timescaledb
check_redis
check_api
echo ""

# Summary
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   Status Check Complete                                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Suggestions
if ! docker compose ps timescaledb 2>/dev/null | grep -q "Up" || ! docker compose ps redis 2>/dev/null | grep -q "Up"; then
    echo -e "${YELLOW}💡 To start infrastructure:${NC}"
    echo "   docker compose up -d timescaledb redis"
    echo ""
fi

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}💡 To install dependencies:${NC}"
    echo "   bun install"
    echo ""
fi

if ! curl -s http://localhost:3000/health &> /dev/null; then
    echo -e "${YELLOW}💡 To start the API server:${NC}"
    echo "   bun run dev"
    echo ""
fi

echo "📚 For more information, see GETTING_STARTED.md"

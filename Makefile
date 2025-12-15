# -----------------------------
# Project configuration
# -----------------------------

APP_ID := pokementor
NODE_BIN := node
NPM_BIN  := npm

# macOS Electron userData path (confirmed via app.getPath)
USER_DATA_DIR := $(HOME)/Library/Application Support/$(APP_ID)
DB_DIR := $(USER_DATA_DIR)/data
DB_PATH := $(DB_DIR)/pokementor.sqlite

# -----------------------------
# Targets
# -----------------------------

.PHONY: help dev install clean db db-schema reset-db

help:
	@echo ""
	@echo "PokeMentor – available commands:"
	@echo ""
	@echo "  make install     Install npm dependencies"
	@echo "  make dev         Run Electron + Vite dev mode"
	@echo "  make db          Open SQLite database"
	@echo "  make db-schema   Show database schema"
	@echo "  make reset-db    Delete local database (DANGER)"
	@echo "  make clean       Remove build artifacts"
	@echo ""

install:
	$(NPM_BIN) install

dev:
	$(NPM_BIN) run dev

# -----------------------------
# SQLite helpers
# -----------------------------

db:
	@mkdir -p "$(DB_DIR)"
	@echo "Opening database:"
	@echo "  $(DB_PATH)"
	sqlite3 "$(DB_PATH)"

db-schema:
	@mkdir -p "$(DB_DIR)"
	sqlite3 "$(DB_PATH)" ".schema"

reset-db:
	@echo "⚠️  This will DELETE your local database:"
	@echo "   $(DB_PATH)"
	@read -p "Are you sure? [y/N] " confirm; \
	if [ "$$confirm" = "y" ]; then \
		rm -f "$(DB_PATH)"; \
		echo "Database removed."; \
	else \
		echo "Aborted."; \
	fi

# -----------------------------
# Cleanup
# -----------------------------

clean:
	rm -rf dist dist-electron node_modules/.vite
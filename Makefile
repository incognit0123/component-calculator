# Fixed project name so every checkout/worktree targets the same stack
# (container_name is fixed, so two stacks can't coexist anyway).
COMPOSE := docker compose -p mount-optimizer
CONTAINER := mount-optimizer-app
SERVICE := app

stop-existing:
	-$(COMPOSE) down
	-docker rm -f $(CONTAINER) >/dev/null 2>&1

.PHONY: stop-existing build up down logs ps restart clean shell

build: stop-existing ## Replace any running app, then build and run (attached with logs)
	$(COMPOSE) up --build

up: stop-existing ## Replace any running app, then run in background
	$(COMPOSE) up -d --build

down: ## Stop and remove containers
	$(COMPOSE) down

logs: ## Tail logs for app service
	$(COMPOSE) logs -f $(SERVICE)

ps: ## Show running services
	$(COMPOSE) ps

restart: ## Restart app service
	$(COMPOSE) restart $(SERVICE)

clean: ## Remove containers and volumes
	$(COMPOSE) down -v

shell: ## Open shell inside app container
	$(COMPOSE) exec $(SERVICE) sh

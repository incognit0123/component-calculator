COMPOSE := docker compose
SERVICE := app

.PHONY: build up down logs ps restart clean shell

build: ## Build and run containers (attached with logs)
	$(COMPOSE) up --build

up: ## Run containers in background
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

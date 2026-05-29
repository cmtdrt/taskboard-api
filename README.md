# Taskboard API (PERRONIÉ Maxence et DROUET Clément)

API REST de gestion de tâches type kanban développée avec Express.js.

## Installation

```bash
npm install
```

## Lancer le serveur

```bash
npm start
```

Le serveur démarre sur le port 3000 par défaut.

## Authentification

Toutes les routes (sauf GET /api/tasks/stats) nécessitent un header `x-api-key`.
Pour les tests, utiliser : `x-api-key: secret-key-123`

## Routes disponibles

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | /api/tasks | Liste des tâches (filtres: `?status=todo`, `?assignee=john`, `?priority=high`) |
| GET | /api/tasks/:id | Détail d'une tâche |
| POST | /api/tasks | Créer une tâche |
| PUT | /api/tasks/:id | Modifier une tâche |
| DELETE | /api/tasks/:id | Supprimer une tâche |
| PATCH | /api/tasks/:id/move | Déplacer une tâche (changer de colonne) |
| GET | /api/tasks/stats | Statistiques du board |

## Format des requêtes

### Créer une tâche (POST /api/tasks)
```json
{
  "title": "Implémenter l'authentification",
  "description": "Mettre en place JWT",
  "status": "todo",
  "priority": "HIGH",
  "assignee": "alice",
  "dueDate": "2024-03-01"
}
```

### Déplacer une tâche (PATCH /api/tasks/:id/move)
```json
{ "status": "doing" }
```

## Statuts valides : `todo`, `doing`, `done`
## Priorités valides : `LOW`, `MEDIUM`, `HIGH`

## Format des réponses

Succès : `{ "success": true, "data": { ... } }`
Erreur : `{ "success": false, "error": "message" }`

# Liste des bugs trouvés de [PERRONIÉ Maxence](https://github.com/mxncp85) et [DROUET Clément](https://github.com/cmtdrt)



## 1. Incohérence du header d'authentification (README vs code) — corrigé

| | |
|---|---|
| **Fichiers** | `src/middleware/auth.js` (l. 4), `README.md` (l. 21-22) |
| **Description** | La documentation indique le header `x-api-key`, alors que le middleware lit `api-key`. |
| **Impact** | Toute requête qui suit le README reçoit un **401 Unauthorized**, alors que `api-key: secret-key-123` fonctionne. |
| **Reproduction** | `curl -H "x-api-key: secret-key-123" http://localhost:3000/api/tasks` → 401 |

---

## 2. Filtre `priority` — casse, `==` et incohérence avec les autres filtres — corrigé

| | |
|---|---|
| **Fichiers** | `README.md` (l. 28), `src/models/tasks.model.js` (l. 20-27) |
| **Description** | (1) Le README propose `?priority=high` en minuscules alors que le seed stocke `HIGH`, `MEDIUM`, `LOW` : comparaison **sensible à la casse**. (2) Le filtre utilise `t.priority == filters.priority` (égalité **faible**) au lieu de `===` comme pour `status` et `assignee` |
| **Impact** | `GET /api/tasks?priority=high` renvoie **0 résultat** alors que `?priority=HIGH` fonctionne ; risque de faux positifs si les types diffèrent ; incohérence de robustesse dans `findAll`. |
| **Reproduction** | `?priority=high` → 0 tâche vs `?priority=HIGH` → 15 tâches. Mettre une tâche avec `priority: 0` (nombre) puis `findAll({ priority: "0" })` → match avec `==`, pas avec `===`. |
| **Correction typique** | Normaliser la casse (`toUpperCase()` des deux côtés) et comparer avec `===`. |

---

## 3. `PATCH /api/tasks/:id/move` — statut non validé — corrigé

| | |
|---|---|
| **Fichier** | `src/controllers/tasks.controller.js` (`moveTask`) |
| **Description** | `moveTask` vérifie seulement la présence de `status`, pas qu'il appartient à `VALID_STATUSES` (`todo`, `doing`, `done`). |
| **Impact** | On peut corrompre le board avec des statuts invalides (`invalid`, `archived`, etc.). |
| **Reproduction** | `PATCH /api/tasks/1/move` avec body `{ "status": "invalid" }` → 200 et tâche mise à jour. |

---

## 4. `PUT /api/tasks/:id` — aucune validation des champs (dont titre vidé) — corrigé

| | |
|---|---|
| **Fichier** | `src/controllers/tasks.controller.js` (`updateTask`) |
| **Description** | `updateTask` fusionne `req.body` sans contrôler `status`, `priority` ni `title`. Cas particulier du **titre** : aucune règle en mise à jour (contrairement au POST) — `PUT` avec `{ "title": "" }` ou `{ "title": "   " }` acceptait la requête et vidait le titre. |
| **Impact** | Statuts et priorités hors enum acceptés ; tâches sans titre lisible ; incohérence avec les règles documentées et avec `createTask`. |
| **Reproduction** | `PUT /api/tasks/2` avec `{ "status": "archived" }` → statut `archived` enregistré. `PUT /api/tasks/4` avec `{ "title": "" }` → 200, titre vide. |

---

## 5. `POST /api/tasks` — priorité non validée — corrigé

| | |
|---|---|
| **Fichier** | `src/controllers/tasks.controller.js` (`createTask`) |
| **Description** | Seul le `status` est validé à la création ; `priority` accepte n'importe quelle valeur. |
| **Impact** | Priorités invalides (`urgent`, `high`, etc.) polluent les stats et les filtres. |
| **Reproduction** | `POST` avec `{ "title": "Test", "priority": "urgent" }` → 201, `priority: "urgent"`. |

---

## 6. `POST /api/tasks` — titre vide ou uniquement des espaces — corrigé

| | |
|---|---|
| **Fichier** | `src/controllers/tasks.controller.js` (`createTask`) |
| **Description** | La condition `if (!title)` rejette `null` / `""` mais accepte `"   "`. |
| **Impact** | Création de tâches sans titre lisible. |
| **Reproduction** | `POST` avec `{ "title": "   " }` → 201. |

---

## 7. `PUT /api/tasks/:id` — `createdAt` modifiable — corrigé

| | |
|---|---|
| **Fichiers** | `src/controllers/tasks.controller.js` (`updateTask`), `src/models/tasks.model.js` (`update`) |
| **Description** | `TaskModel.update` étend la tâche avec tout le corps de la requête ; seul `id` est protégé, pas `createdAt`. |
| **Impact** | La date de création est modifiable. |
| **Reproduction** | `PUT /api/tasks/3` avec `{ "createdAt": "2099-01-01T00:00:00Z" }` → date modifiée. |

---

## 8. `GET /api/tasks/stats` — tâches sans `dueDate` comptées en retard — corrigé

| | |
|---|---|
| **Fichier** | `src/controllers/tasks.controller.js` (`getStats`) |
| **Description** | Pour `dueDate: null`, `new Date(null)` vaut le **1er janvier 1970**, toujours `< now`, donc compté comme en retard. |
| **Impact** | Le nombre de tâches en retard est faussé. |
| **Reproduction** | Créer une tâche avec une dueDate null puis vérifier que la tâche est considérée comme en retard. |

---

## 9. `GET /api/tasks/stats` — tâches terminées incluses dans `overdue` — corrigé

| | |
|---|---|
| **Fichier** | `src/controllers/tasks.controller.js` (`getStats`) |
| **Description** | Le calcul de retard ne filtre pas sur `status !== "done"`. |
| **Impact** | Des tâches **done** avec une échéance passée augmentent `overdue` alors qu'elles ne sont plus actives. |
| **Reproduction** | Tâches done du seed (ex. id 1, 2, 12) avec `dueDate` en 2024 → incluses dans `overdue`. |

---

## 10. `parseInt` sur `:id` — parsing partiel des identifiants — corrigé

| | |
|---|---|
| **Fichiers** | `src/models/tasks.model.js`, utilisé par `getTaskById`, `updateTask`, `deleteTask`, `moveTask` |
| **Description** | `findById` (et `update` / `delete`) utilisent `parseInt(id)` sans vérifier que `req.params.id` est un entier **strict**. `parseInt` s'arrête au premier caractère non numérique : `"12abc"` → `12`, `"1.9"` → `1`, `"0x10"` → `16`. |
| **Impact** | Des URLs invalides renvoient quand même une tâche (200) au lieu d'une erreur **404** ou **400** |
| **Reproduction** | `GET /api/tasks/12abc` → tâche **id 12** ; `GET /api/tasks/1.9` → tâche **id 1**. |

---

## 11. `dueDate` — aucune validation du format (POST / PUT) — corrigé

| | |
|---|---|
| **Fichiers** | `src/controllers/tasks.controller.js`, `src/models/tasks.model.js` |
| **Description** | `dueDate` est recopié tel quel depuis `req.body`, sans contrôle de format (`YYYY-MM-DD`, ISO 8601, etc.) ni de date valide. |
| **Impact** | Valeurs arbitraires acceptées (`"pas-une-date"`, `"nimporte quoi"`, nombre `12345`, etc.) → données incohérentes ; le README documente pourtant un format date. Les stats `overdue` ignorent les dates invalides (`new Date("xxx")` → `Invalid Date`, jamais `< now`), ce qui crée une incohérence avec les `dueDate: null` comptées en retard (bug #8). |
| **Reproduction** | `POST /api/tasks` avec `{ "title": "Test", "dueDate": "pas-une-date" }` → **201** ; `PUT /api/tasks/5` avec `{ "dueDate": "nimporte quoi" }` → **200**. |

**Correction typique** : parser la date, vérifier `!Number.isNaN(date.getTime())`, optionnellement imposer un format (ex. `YYYY-MM-DD`) et rejeter en **400** si invalide.

---

**Total : 11 bugs**

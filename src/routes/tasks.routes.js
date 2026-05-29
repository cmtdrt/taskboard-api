const express = require('express');
const router = express.Router();
const tasksController = require('../controllers/tasks.controller');
const authMiddleware = require('../middleware/auth');

// Stats route — public
router.get('/stats', tasksController.getStats);

// Protected routes
router.use(authMiddleware);

router.get('/', tasksController.getTasks);
router.post('/', tasksController.createTask);
router.get('/:id', tasksController.getTaskById);
router.put('/:id', tasksController.updateTask);
router.delete('/:id', tasksController.deleteTask);
router.patch('/:id/move', tasksController.moveTask);

module.exports = router;

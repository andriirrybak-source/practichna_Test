
require('dotenv').config({ quiet: true });
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const storage = require('./dto/storage');

const app = express();
const PORT = process.env.PORT || 3111;

app.use(express.json());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Токен відсутній' });
  }

  try {
    req.user = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(403).json({ error: 'Токен недійсний або прострочений' });
  }
};

const requireRole = (role) => (req, res, next) => {
  if (!req.user || req.user.role !== role) {
    return res.status(403).json({ error: 'Доступ заборонено' });
  }
  next();
};

app.get('/', (req, res) => {
  res.json({ message: 'Сервер працює!' });
});

app.post('/auth/register', async (req, res) => {
  const { username, password, name, role } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Вкажіть username та password' });
  }

  const users = await storage.getUsers();

  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Користувач вже існує' });
  }

  const newUser = {
    id: storage.nextId(users),
    username,
    passwordHash: await bcrypt.hash(password, 10),
    name: name || username,
    role: role === 'admin' ? 'admin' : 'user'
  };

  users.push(newUser);
  await storage.saveUsers(users);

  const { passwordHash, ...safeUser } = newUser;
  res.status(201).json({ message: 'Реєстрація успішна', user: safeUser });
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const user = await storage.findUserByUsername(username);

  if (!user || !(await bcrypt.compare(password || '', user.passwordHash || ''))) {
    return res.status(401).json({ error: 'Невірний логін або пароль' });
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  res.json({ message: 'Авторизація успішна', token });
});

app.get('/users', authenticateJWT, requireRole('admin'), async (req, res) => {
  const users = await storage.getUsers();
  res.json(users.map(({ passwordHash, ...u }) => u));
});

app.get('/users/:id', authenticateJWT, async (req, res) => {
  const user = await storage.findUserById(req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'Користувача не знайдено' });
  }

  res.json(user);
});

app.post('/orders', authenticateJWT, async (req, res) => {
  const { product, amount } = req.body || {};

  if (!product || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Невірні дані замовлення' });
  }

  const orders = await storage.getOrders();

  const newOrder = {
    id: storage.nextId(orders),
    userId: req.user.userId,
    product,
    amount: Number(amount)
  };

  orders.push(newOrder);
  await storage.saveOrders(orders);

  res.status(201).json({
    message: 'Замовлення успішно створено',
    order: newOrder
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не знайдено' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: 'Помилка сервера',
    details: err.message
  });
});

app.listen(PORT, () => {
  console.log(`Server is running at http://127.0.0.1:${PORT}`);
});

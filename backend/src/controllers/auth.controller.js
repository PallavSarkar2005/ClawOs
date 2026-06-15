const bcrypt = require("bcryptjs");
const prisma = require("../database/prisma");
const { generateToken } = require("../services/jwt.service");

async function register(req, res) {
  try {
    const { name, email, password } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    const token = generateToken(user);

    const { password: _, ...safeUser } = user;

    res.status(201).json({
      token,
      user: safeUser,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server Error",
    });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const token = generateToken(user);

    const { password: _, ...safeUser } = user;

    res.json({
      token,
      user: safeUser,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server Error",
    });
  }
}

async function me(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: req.user.id,
      },
    });

    const { password, ...safeUser } = user;

    res.json(safeUser);
  } catch (error) {
    res.status(500).json({
      message: "Server Error",
    });
  }
}

module.exports = {
  register,
  login,
  me,
};

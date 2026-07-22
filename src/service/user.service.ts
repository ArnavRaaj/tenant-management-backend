import { Request, Response } from "express";
import {
  createUser,
  findOneUserByEmail,
  findUserByEmail,
} from "../repository/user.repository";

const { generateToken } = require("../utils/helpers");

export const registerUserService = async (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    res.status(400).json({ message: "Please add all fields" });
    return;
  }

  const userExists = await findUserByEmail(email);

  if (userExists) {
    res.status(400).json({ message: "User already exists" });
    return;
  }

  const user = await createUser(name, email, password);

  if (user) {
    res.status(201).json({
      _id: user.id,
      name: user.name,
      email: user.email,
      token: generateToken(user._id),
    });
  } else {
    res.status(400).json({ message: "Invalid user data" });
  }
};

export const loginUserService = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await findOneUserByEmail(email);

  if (user && (await user.matchPassword(password))) {
    res.json({
      _id: user.id,
      name: user.name,
      email: user.email,
      token: generateToken(user._id),
    });
  } else {
    res.status(401).json({ message: "Invalid credentials" });
  }
};

export const getMeService = async (req: any, res: Response) => {
  res.status(200).json(req.user);
};

import { Request } from "express";
import {
  createUser,
  findOneUserByEmail,
  findUserByEmail,
} from "../repository/user.repository";
import { AppError } from "../utils/AppError";

const { generateToken } = require("../utils/helpers");

export const registerUserService = async (req: Request) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    throw new AppError("Please add all fields", 400);
  }

  const userExists = await findUserByEmail(email);

  if (userExists) {
    throw new AppError("User already exists", 400);
  }

  const user = await createUser(name, email, password);

  if (user) {
    return {
      _id: user.id,
      name: user.name,
      email: user.email,
      token: generateToken(user._id),
    };
  } else {
    throw new AppError("Invalid user data", 400);
  }
};

export const loginUserService = async (req: Request) => {
  const { email, password } = req.body;

  const user = await findOneUserByEmail(email);

  if (user && (await user.matchPassword(password))) {
    return {
      _id: user.id,
      name: user.name,
      email: user.email,
      token: generateToken(user._id),
    };
  } else {
    throw new AppError("Invalid credentials", 401);
  }
};

export const getMeService = async (req: any) => {
  return req.user;
};

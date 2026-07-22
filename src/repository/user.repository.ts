const User = require("../models/User");

export const createUser = async (
  name: string,
  email: string,
  password: string,
) => {
  return await User.create({ name, email, password });
};

export const findUserByEmail = async (email: string) => {
  return await User.findOne({ email });
};

export const findOneUserByEmail = async (email: string) => {
  return await User.findOne({ email }).select("+password");
};

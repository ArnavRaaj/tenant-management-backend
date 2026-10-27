import { Response, NextFunction } from "express";
const jwt = require("jsonwebtoken");
const asyncHandler =
  require("express-async-handler") || require("../utils/helpers").asyncHandler;
const User = require("../models/User");
import { UnauthorizedError } from "../utils/AppError";

const protect = asyncHandler(
  async (req: any, res: Response, next: NextFunction) => {
    let token: string | undefined;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      try {
        // Get token from header
        token = req.headers.authorization.split(" ")[1];

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get user from the token
        req.user = await User.findById(decoded.id).select("-password");

        if (!req.user) {
          return next(new UnauthorizedError("Not authorized, user not found"));
        }

        req.organizationId =
          req.user.role === "superadmin" ? req.user._id : req.user.superadminId;

        return next();
      } catch {
        return next(new UnauthorizedError("Not authorized, token failed or expired"));
      }
    }

    if (!token) {
      return next(new UnauthorizedError("Not authorized, no token provided"));
    }
  },
);

module.exports = { protect };

import { Response, NextFunction } from "express";
const jwt = require("jsonwebtoken");
const asyncHandler =
  require("express-async-handler") || require("../utils/helpers").asyncHandler;
const User = require("../models/User");
import { auditLog } from "./auditMiddleware";

const protect = asyncHandler(
  async (req: any, res: Response, next: NextFunction) => {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      try {
        // Get token from header
        token = req.headers.authorization.split(" ")[1];

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get user from the token
        req.user = await User.findById(decoded.id).select("-password");

        if (!req.user) {
          res.status(401).json({ message: "Not authorized, user not found" });
          return;
        }
        
        req.organizationId = req.user.role === 'superadmin' ? req.user._id : req.user.superadminId;

        // Log the action and proceed
        return auditLog(req, res, next);
      } catch (error) {
        console.error(error);
        res.status(401).json({ message: "Not authorized, token failed" });
      }
    }

    if (!token) {
      res.status(401).json({ message: "Not authorized, no token" });
    }
  },
);

module.exports = { protect };

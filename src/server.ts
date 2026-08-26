import express, { Request, Response } from "express";
import { responseMiddleware } from "./middlewares/responseMiddleware";
import { errorMiddleware } from "./middlewares/errorMiddleware";
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const dotenv = require("dotenv");
const connectDB = require("./config/mongo.config");

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();
app.disable("etag"); // Disable ETags to prevent 304 Not Modified responses

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/flats", require("./routes/flats"));
app.use("/api/tenants", require("./routes/tenants"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/addresses", require("./routes/address"));
app.use("/api/users", require("./routes/user.routes"));

app.get("/", (req: Request, res: Response) => {
  res.send("Tenant Management API is running...");
});

// Post-route Middlewares
app.use(responseMiddleware);
app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `Server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`,
  );
});

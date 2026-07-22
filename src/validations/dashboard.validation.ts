import Joi from "joi";

export const getDashboardStatsSchema = {
  query: Joi.object({
    month: Joi.string().optional(),
    year: Joi.number().optional(),
  }),
};

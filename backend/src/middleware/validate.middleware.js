/**
 * Zod validation middleware for body, query, and params.
 */
function validate(schema, source = "body") {
  return (req, res, next) => {
    const target = source === "query" ? req.query : source === "params" ? req.params : req.body;
    const result = schema.safeParse(target);

    if (!result.success) {
      const issues = result.error.issues || result.error.errors || [];
      const details = issues.map((issue) => ({
        path: Array.isArray(issue.path) ? issue.path.join(".") : String(issue.path || ""),
        message: issue.message,
        code: issue.code,
      }));

      return res.status(400).json({
        message: details[0]?.message || "Validation failed",
        errors: details,
        validation: result.error.format?.() || undefined,
      });
    }

    if (source === "query") {
      req.query = result.data;
    } else if (source === "params") {
      req.params = { ...req.params, ...result.data };
    } else {
      req.body = result.data;
    }

    return next();
  };
}

module.exports = { validate };

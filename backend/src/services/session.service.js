class SessionService {
  parseRequest(req) {
    const userAgent = req.headers["user-agent"] || "Unknown Device";
    const ipAddress = req.ip || req.headers["x-forwarded-for"] || "127.0.0.1";

    let browser = "Other Browser";
    let os = "Other OS";

    // Lightweight User-Agent browser detection
    if (/chrome|crios/i.test(userAgent) && !/edge|edg/i.test(userAgent) && !/opr|opera/i.test(userAgent)) {
      browser = "Chrome";
    } else if (/safari/i.test(userAgent) && !/chrome|crios/i.test(userAgent)) {
      browser = "Safari";
    } else if (/firefox|iceweasel/i.test(userAgent)) {
      browser = "Firefox";
    } else if (/edge|edg/i.test(userAgent)) {
      browser = "Microsoft Edge";
    } else if (/opr|opera/i.test(userAgent)) {
      browser = "Opera";
    }

    // Lightweight User-Agent OS detection
    if (/windows/i.test(userAgent)) {
      os = "Windows";
    } else if (/macintosh|mac os x/i.test(userAgent)) {
      os = "macOS";
    } else if (/linux/i.test(userAgent) && !/android/i.test(userAgent)) {
      os = "Linux";
    } else if (/android/i.test(userAgent)) {
      os = "Android";
    } else if (/iphone|ipad|ipod/i.test(userAgent)) {
      os = "iOS";
    }

    let device = "desktop";
    if (/mobile|iphone|android/i.test(userAgent) && !/ipad|tablet/i.test(userAgent)) {
      device = "mobile";
    } else if (/ipad|tablet/i.test(userAgent)) {
      device = "tablet";
    }

    const location = null;

    return {
      userAgent,
      ipAddress: String(ipAddress).split(",")[0].trim(),
      browser,
      os,
      device,
      location,
    };
  }
}

module.exports = new SessionService();

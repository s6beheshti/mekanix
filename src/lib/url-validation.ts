export function isPublicHttpsOrigin(value: string | null | undefined): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const ipv6Host = hostname.replace(/^\[|\]$/g, "");
    const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
    const isIpv6 = hostname.includes(":");

    const reservedHostname =
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".test") ||
      hostname.endsWith(".example") ||
      hostname.endsWith(".invalid");

    const privateIpv4 =
      /^0\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^127\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(hostname) ||
      /^198\.(1[89])\./.test(hostname) ||
      /^192\.0\.(0|2)\./.test(hostname) ||
      /^198\.51\.100\./.test(hostname) ||
      /^203\.0\.113\./.test(hostname) ||
      /^(22[4-9]|23\d|24\d|25[0-5])\./.test(hostname);

    const privateIpv6 =
      ipv6Host === "::1" ||
      ipv6Host === "::" ||
      ipv6Host.startsWith("::ffff:") ||
      /^f[cd]/i.test(ipv6Host) ||
      /^fe[89ab]/i.test(ipv6Host) ||
      /^fec[0-9a-f]/i.test(ipv6Host);

    const isPublicHostname =
      (isIpv4 || isIpv6 || hostname.includes(".")) &&
      !reservedHostname &&
      !(isIpv4 && privateIpv4) &&
      !(isIpv6 && privateIpv6);

    return (
      url.protocol === "https:" &&
      isPublicHostname &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

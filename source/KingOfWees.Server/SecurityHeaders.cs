namespace KingOfWees.Server;

// What the browser may load, and that no other site may frame the page. The admin key lives in localStorage, so only
// the page's own scripts may ever run. Why → docs/patterns/security-headers.md.
internal static class SecurityHeaders
{
    // data: for the fonts and icons the build inlines; blob: for a photo's preview before it's sent.
    private const string ContentSecurityPolicy =
        "default-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org; font-src 'self' data:; " +
        "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

    public static void UseSecurityHeaders(this WebApplication app) =>
        app.Use((context, next) =>
        {
            // At send time: the exception handler clears headers set earlier.
            context.Response.OnStarting(() =>
            {
                var headers = context.Response.Headers;
                headers.ContentSecurityPolicy = ContentSecurityPolicy;
                // Sent over plain HTTP too: behind the ingress every request reaches the app as HTTP, and browsers
                // ignore the header unless it arrives over HTTPS.
                headers.StrictTransportSecurity = "max-age=31536000";
                headers.XContentTypeOptions = "nosniff";
                // OpenStreetMap's tile policy requires a Referer naming the site.
                headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
                // No other site may load the site's files, such as showing King's photos in its own <img>.
                headers["Cross-Origin-Resource-Policy"] = "same-origin";
                return Task.CompletedTask;
            });
            return next(context);
        });
}

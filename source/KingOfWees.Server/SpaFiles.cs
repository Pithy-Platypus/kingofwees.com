using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Net.Http.Headers;

namespace KingOfWees.Server;

// The built SPA in wwwroot (layered into the image by infra/deploy.sh). The frontend build writes a brotli and a gzip
// copy beside each script and stylesheet (source/frontend/build/precompress.ts), so nothing is compressed per request
// on a 0.25 vCPU app. Why → docs/patterns/site-size.md.
internal static class SpaFiles
{
    private const string Assets = "/assets";
    // Vite names every file under /assets/ by its content, so a changed file is a new address: cache for good.
    private const string AssetCache = "public, max-age=31536000, immutable";
    // Pages keep their address across deploys: always ask again (a 304 when unchanged), so a deploy shows at once.
    private const string PageCache = "no-cache";
    // Preference order when the browser rates both the same.
    private static readonly (string Encoding, string Extension)[] Copies = [("br", ".br"), ("gzip", ".gz")];

    public static void MapSpaFiles(this WebApplication app)
    {
        var files = app.Environment.WebRootFileProvider;
        app.Use((context, next) =>
        {
            ServeCompressedCopy(context, files);
            return next(context);
        });

        var fileServer = new FileServerOptions();
        Configure(fileServer.StaticFileOptions);
        app.UseFileServer(fileServer);

        var fallback = new StaticFileOptions();
        Configure(fallback);
        // Deep links like /about load the SPA; a path that looks like a file (a missing /assets/ script) stays a 404.
        app.MapFallbackToFile("index.html", fallback);
    }

    private static void Configure(StaticFileOptions options)
    {
        options.ContentTypeProvider = new CopyContentTypes();
        options.OnPrepareResponse = context => context.Context.Response.Headers.CacheControl =
            context.Context.Request.Path.StartsWithSegments(Assets) ? AssetCache : PageCache;
    }

    // Points the request at the copy the browser accepts best, and says how it's encoded; the static file middleware
    // then serves that file with its own length and ETag.
    private static void ServeCompressedCopy(HttpContext context, IFileProvider files)
    {
        var request = context.Request;
        if (!(HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method)) || !request.Path.StartsWithSegments(Assets))
        {
            return;
        }

        var path = request.Path.Value!;
        var available = Copies.Where(c => files.GetFileInfo(path + c.Extension).Exists).ToList();
        if (available.Count == 0) return;

        context.Response.Headers.Append(HeaderNames.Vary, HeaderNames.AcceptEncoding);
        var accepted = request.GetTypedHeaders().AcceptEncoding;
        var best = available
            .Select(c => (Copy: c, Quality: QualityOf(accepted, c.Encoding)))
            .Where(c => c.Quality > 0)
            .OrderByDescending(c => c.Quality) // stable: ties keep the preference order
            .Select(c => c.Copy)
            .FirstOrDefault();
        if (best == default) return;

        request.Path = path + best.Extension;
        context.Response.Headers.ContentEncoding = best.Encoding;
    }

    // An encoding the browser didn't list isn't accepted; "*" stands for any not listed; no rating means 1.
    private static double QualityOf(IList<StringWithQualityHeaderValue> accepted, string encoding)
    {
        var rating = accepted.FirstOrDefault(a => a.Value.Equals(encoding, StringComparison.OrdinalIgnoreCase))
            ?? accepted.FirstOrDefault(a => a.Value.Equals("*", StringComparison.Ordinal));
        return rating is null ? 0 : rating.Quality ?? 1;
    }

    // A copy has its original's type: index-abc.js.br is text/javascript.
    private sealed class CopyContentTypes : IContentTypeProvider
    {
        private readonly FileExtensionContentTypeProvider _types = new();

        public bool TryGetContentType(string subpath, out string contentType)
        {
            var original = Copies.FirstOrDefault(c => subpath.EndsWith(c.Extension, StringComparison.Ordinal));
            return _types.TryGetContentType(original == default ? subpath : subpath[..^original.Extension.Length], out contentType!);
        }
    }
}

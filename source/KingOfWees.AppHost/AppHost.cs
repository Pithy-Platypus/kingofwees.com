using Microsoft.Extensions.Configuration;

var builder = DistributedApplication.CreateBuilder(args);

var mongo = builder.AddMongoDB("mongo");
// Tests pass PersistData=false so they never share the dev data volume.
if (builder.Configuration.GetValue("PersistData", true))
{
    mongo.WithDataVolume();
}
var kingDb = mongo.AddDatabase("king");

var server = builder.AddProject<Projects.KingOfWees_Server>("server")
    .WithReference(kingDb)
    .WaitFor(kingDb)
    .WithHttpHealthCheck("/health")
    .WithExternalHttpEndpoints();

var webfrontend = builder.AddViteApp("webfrontend", "../frontend")
    .WithBun()
    .WithReference(server)
    .WaitFor(server);

server.PublishWithContainerFiles(webfrontend, "wwwroot");

builder.Build().Run();

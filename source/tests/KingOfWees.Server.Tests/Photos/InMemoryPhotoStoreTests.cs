using KingOfWees.Server.King;
using KingOfWees.Server.Photos;
using KingOfWees.Server.Tests.King;

namespace KingOfWees.Server.Tests.Photos;

public sealed class InMemoryPhotoStoreTests : PhotoStoreContract
{
    protected override (IPhotoStore Photos, IKingEventStore Events, IHiddenReporterStore Hidden) CreateStores()
    {
        var hidden = new InMemoryHiddenReporterStore();
        var events = new InMemoryKingEventStore(hidden);
        return (new InMemoryPhotoStore(events, hidden), events, hidden);
    }
}

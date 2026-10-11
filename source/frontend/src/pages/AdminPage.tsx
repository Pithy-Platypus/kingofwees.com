import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { defineMessages, FormattedMessage, useIntl, type MessageDescriptor, type MessageTag, type NoMessageValues } from 'react-intl';
import {
  isKeyRejected,
  looksLikeKeyHash,
  type ActivityRecord,
  type AdminApi,
  type AdminSignIn,
  type AdminSpot,
  type HiddenDevice,
} from '../king/admin';
import { ActivityItem } from '../king/ActivityItem';
import { ApiError, NICKNAME_MAX_LENGTH, SPOT_NAME_MAX_LENGTH, type KingEventView, type SpotView } from '../king/api';
import { common } from '../king/messages';
import { useSpotsByName } from '../king/useSpotsByName';
import { Link } from '../routing/Link';
import { PageShell } from './PageShell';

type Values = {
  title: NoMessageValues;
  keyLabel: NoMessageValues;
  keyHint: NoMessageValues;
  check: NoMessageValues;
  wrongKey: NoMessageValues;
  hashPasted: NoMessageValues;
  tooMany: NoMessageValues;
  unreachable: NoMessageValues;
  howToHide: { history: MessageTag };
  entriesHeading: NoMessageValues;
  noEntries: NoMessageValues;
  showAgain: NoMessageValues;
  postersHeading: NoMessageValues;
  noPosters: NoMessageValues;
  poster: { entries: number; spots: number; when: string };
  restore: NoMessageValues;
  loading: NoMessageValues;
  loadFailed: NoMessageValues;
  actionFailed: NoMessageValues;
  signOut: NoMessageValues;
  placesHeading: NoMessageValues;
  noPlaces: NoMessageValues;
  rename: NoMessageValues;
  renamePlace: { name: string };
  newName: NoMessageValues;
  save: NoMessageValues;
  cancel: NoMessageValues;
  nameTaken: NoMessageValues;
  nameRequired: NoMessageValues;
  placeFeedings: { feedings: number };
  placeFeedingsHidden: { feedings: number };
  mergeHint: NoMessageValues;
  tickPlace: { name: string };
  mergeStart: { count: number };
  mergeKeep: NoMessageValues;
  mergeNewName: NoMessageValues;
  mergeConfirm: { others: string; kept: string; feedings: number };
  mergeRenamed: { kept: string; name: string };
  merge: NoMessageValues;
  mergeCancel: NoMessageValues;
  mergedPlaces: { merged: string; kept: string; renamed: string; newName: string; feedings: number };
  nameLabel: NoMessageValues;
  nameHint: NoMessageValues;
  activityHeading: NoMessageValues;
  activityNote: NoMessageValues;
  activityLoading: NoMessageValues;
  activityFailed: NoMessageValues;
  noActivity: NoMessageValues;
  showOlderActivity: NoMessageValues;
  signedIn: NoMessageValues;
  wrongKeyTried: NoMessageValues;
  hidEntry: { kind: string; poster: string; hasPlace: string; place: string; when: string };
  showedEntry: { kind: string; poster: string; hasPlace: string; place: string; when: string };
  hidPoster: { poster: string; entries: number; spots: number };
  restoredPoster: { poster: string; entries: number; spots: number };
  renamedPlace: { from: string; to: string };
  activityBy: { name: string; address: string; when: string };
  noName: NoMessageValues;
  unknownAddress: NoMessageValues;
};

const m = defineMessages<Values>({
  title: { id: 'admin.title', defaultMessage: 'Admin', description: 'Heading of the admin page, for the site’s caretakers' },
  keyLabel: { id: 'admin.keyLabel', defaultMessage: 'Admin key', description: 'Label of the admin key field' },
  keyHint: { id: 'admin.keyHint', defaultMessage: 'Only the site’s caretakers have one.', description: 'Under the admin key field' },
  check: { id: 'admin.check', defaultMessage: 'Check key', description: 'Checks the admin key with the site and keeps it on this device' },
  wrongKey: { id: 'admin.wrongKey', defaultMessage: 'That key didn’t work.', description: 'The site refused the admin key' },
  hashPasted: {
    id: 'admin.hashPasted',
    defaultMessage: 'That looks like the key’s hash. Enter the key itself — the shorter line from the key tool.',
    description: 'The 64-character server setting was entered instead of the admin key',
  },
  tooMany: {
    id: 'admin.tooMany',
    defaultMessage: 'Too many tries. Wait a minute, then try again.',
    description: 'The site is limiting admin requests from this address',
  },
  unreachable: { id: 'admin.unreachable', defaultMessage: 'Couldn’t reach the site. Try again.', description: 'Checking the key failed' },
  howToHide: {
    id: 'admin.howToHide',
    defaultMessage: 'To hide something, use the buttons under each entry on <history>King’s history</history>.',
    description: 'Tells admins where hiding happens; <history> links to the history page',
  },
  entriesHeading: { id: 'admin.entriesHeading', defaultMessage: 'Hidden entries', description: 'Heading over entries hidden one by one' },
  noEntries: { id: 'admin.noEntries', defaultMessage: 'No hidden entries.', description: 'No entry is hidden on its own' },
  showAgain: { id: 'admin.showAgain', defaultMessage: 'Show again', description: 'Un-hides one entry' },
  postersHeading: { id: 'admin.postersHeading', defaultMessage: 'Hidden posters', description: 'Heading over hidden posters (devices)' },
  noPosters: { id: 'admin.noPosters', defaultMessage: 'No hidden posters.', description: 'No poster is hidden' },
  poster: {
    id: 'admin.poster',
    defaultMessage:
      '{entries, plural, one {# entry} other {# entries}} · {spots, plural, one {# spot} other {# spots}} · hidden {when}',
    description: 'What a hidden poster posted; {when} is the date they were hidden',
  },
  restore: { id: 'admin.restore', defaultMessage: 'Restore', description: 'Shows everything from a hidden poster again' },
  loading: { id: 'admin.loading', defaultMessage: 'Loading what’s hidden…', description: 'Shown while the hidden lists load' },
  loadFailed: { id: 'admin.loadFailed', defaultMessage: 'Couldn’t load what’s hidden.', description: 'The hidden lists failed to load' },
  actionFailed: { id: 'admin.actionFailed', defaultMessage: 'That didn’t work. Try again.', description: 'Show again or Restore failed' },
  signOut: { id: 'admin.signOut', defaultMessage: 'Sign out on this device', description: 'Forgets the admin key on this device' },
  placesHeading: { id: 'admin.placesHeading', defaultMessage: 'Places', description: 'Heading over the list of feeding places (spots)' },
  noPlaces: { id: 'admin.noPlaces', defaultMessage: 'No places yet.', description: 'Nobody has added a feeding place' },
  rename: { id: 'admin.rename', defaultMessage: 'Rename', description: 'Opens a field to change a place’s name' },
  renamePlace: {
    id: 'admin.renamePlace',
    defaultMessage: 'Rename {name}',
    description: 'Accessible name of a Rename button; {name} is the place’s current name',
  },
  newName: { id: 'admin.newName', defaultMessage: 'New name', description: 'Label of the field for a place’s new name' },
  save: { id: 'admin.save', defaultMessage: 'Save', description: 'Saves a place’s new name' },
  cancel: { id: 'admin.cancelRename', defaultMessage: 'Cancel', description: 'Closes the rename field without saving' },
  nameTaken: {
    id: 'admin.nameTaken',
    defaultMessage: 'Another place already has that name.',
    description: 'The new name matches another place’s name (ignoring capitals)',
  },
  nameRequired: { id: 'admin.nameRequired', defaultMessage: 'Enter a name.', description: 'The new name was empty' },
  placeFeedings: {
    id: 'admin.placeFeedings',
    defaultMessage: '{feedings, plural, one {# feeding} other {# feedings}}',
    description: 'Under a place: how many feedings it has, hidden ones included',
  },
  placeFeedingsHidden: {
    id: 'admin.placeFeedingsHidden',
    defaultMessage: '{feedings, plural, one {# feeding} other {# feedings}} · from a hidden poster',
    description: 'Under a place added by a hidden poster (only admins see it): how many feedings it has',
  },
  mergeHint: {
    id: 'admin.mergeHint',
    defaultMessage: 'Tick two or more places to merge them.',
    description: 'Under the Places heading: how to start merging duplicate places',
  },
  tickPlace: {
    id: 'admin.tickPlace',
    defaultMessage: 'Select {name} for merging',
    description: 'Accessible name of the tick box beside a place',
  },
  mergeStart: {
    id: 'admin.mergeStart',
    defaultMessage: 'Merge {count} places…',
    description: 'Opens the merge choices for the ticked places',
  },
  mergeKeep: {
    id: 'admin.mergeKeep',
    defaultMessage: 'Which place keeps its pin?',
    description: 'Question over the ticked places when merging: the kept place stays, the others are deleted',
  },
  mergeNewName: {
    id: 'admin.mergeNewName',
    defaultMessage: 'New name (optional)',
    description: 'Label of the field for a new name for the kept place',
  },
  mergeConfirm: {
    id: 'admin.mergeConfirm',
    defaultMessage:
      'Merge {others} into {kept}? {feedings, plural, =0 {No feedings move.} one {# feeding moves there.} other {# feedings move there.}} The other places are deleted for good — this can’t be undone.',
    description: 'Says what merging will do before it happens; {others} is a list of place names',
  },
  mergeRenamed: {
    id: 'admin.mergeRenamed',
    defaultMessage: '{kept} will then be called {name}.',
    description: 'Shown when a new name was typed for the kept place',
  },
  merge: { id: 'admin.merge', defaultMessage: 'Merge', description: 'Merges the ticked places for good' },
  mergeCancel: { id: 'admin.mergeCancel', defaultMessage: 'Cancel merging', description: 'Closes the merge choices without merging' },
  mergedPlaces: {
    id: 'admin.activity.mergePlaces',
    defaultMessage:
      'Merged {merged} into {kept}{renamed, select, yes {, now called {newName}} other {}} ({feedings, plural, one {# feeding moved} other {# feedings moved}})',
    description: 'Activity line: places were merged; {merged} is a list of the deleted places’ names',
  },
  nameLabel: { id: 'admin.nameLabel', defaultMessage: 'Your name', description: 'Label of the field for the admin’s own name, at sign-in' },
  nameHint: {
    id: 'admin.nameHint',
    defaultMessage: 'Saved with everything you do here, so the other caretakers can see who did what.',
    description: 'Under the admin’s name field: the name goes into the activity log',
  },
  activityHeading: { id: 'admin.activityHeading', defaultMessage: 'Activity', description: 'Heading over the log of admin sign-ins and changes' },
  activityNote: {
    id: 'admin.activityNote',
    defaultMessage:
      'Every sign-in, wrong key and change made here, newest first, kept for a year. Names are what each person typed when signing in: anyone with the key can type any name, so a name is a claim, not proof.',
    description: 'Explains the activity log; there is one shared key, so names are not verified',
  },
  activityLoading: { id: 'admin.activityLoading', defaultMessage: 'Loading activity…', description: 'Shown while the activity log loads' },
  activityFailed: { id: 'admin.activityFailed', defaultMessage: 'Couldn’t load the activity.', description: 'The activity log failed to load' },
  noActivity: { id: 'admin.noActivity', defaultMessage: 'Nothing yet.', description: 'The activity log is empty' },
  showOlderActivity: {
    id: 'admin.showOlderActivity',
    defaultMessage: 'Show older activity',
    description: 'Loads the next, older page of the activity log',
  },
  signedIn: { id: 'admin.activity.signIn', defaultMessage: 'Signed in', description: 'Activity line: someone signed in with the right key' },
  wrongKeyTried: {
    id: 'admin.activity.signInFailed',
    defaultMessage: 'Tried a wrong key',
    description: 'Activity line: someone tried a wrong admin key',
  },
  hidEntry: {
    id: 'admin.activity.hideEntry',
    defaultMessage:
      'Hid {kind, select, fed {a feeding} other {a sighting}} by {poster}{hasPlace, select, yes { at {place}} other {}} ({when})',
    description: 'Activity line: one entry was hidden; {poster} posted it, {place} is its feeding place, {when} the entry’s date',
  },
  showedEntry: {
    id: 'admin.activity.showEntry',
    defaultMessage:
      'Showed {kind, select, fed {a feeding} other {a sighting}} by {poster}{hasPlace, select, yes { at {place}} other {}} again ({when})',
    description: 'Activity line: a hidden entry was shown again; {poster} posted it, {when} is the entry’s date',
  },
  hidPoster: {
    id: 'admin.activity.hidePoster',
    defaultMessage:
      'Hid everything from {poster} ({entries, plural, one {# entry} other {# entries}}, {spots, plural, one {# spot} other {# spots}})',
    description: 'Activity line: everything from one poster was hidden',
  },
  restoredPoster: {
    id: 'admin.activity.restorePoster',
    defaultMessage:
      'Restored everything from {poster} ({entries, plural, one {# entry} other {# entries}}, {spots, plural, one {# spot} other {# spots}})',
    description: 'Activity line: a hidden poster was restored',
  },
  renamedPlace: { id: 'admin.activity.renamePlace', defaultMessage: 'Renamed {from} to {to}', description: 'Activity line: a place was renamed' },
  activityBy: {
    id: 'admin.activityBy',
    defaultMessage: '{name} · {address} · {when}',
    description: 'Under an activity line: the name typed at sign-in, the internet address, and the date and time',
  },
  noName: { id: 'admin.noName', defaultMessage: 'no name', description: 'In the activity log: no name was typed at sign-in' },
  unknownAddress: { id: 'admin.unknownAddress', defaultMessage: 'unknown address', description: 'In the activity log: no internet address was known' },
});

type Props = {
  api: AdminApi;
  signIn: AdminSignIn | null;
  onSignIn: (signIn: AdminSignIn | null) => void;
  spots: SpotView[];
  onSpotRenamed: (id: string, name: string) => void;
  onSpotsMerged: (keptId: string, name: string, mergedIds: string[]) => void;
  now: Date;
};

/** The caretakers' page: not linked anywhere. Without a key it asks for one; with one it lists what's hidden. */
export function AdminPage({ api, signIn, onSignIn, spots, onSpotRenamed, onSpotsMerged, now }: Props) {
  return (
    <PageShell title={<FormattedMessage {...m.title} />}>
      {signIn ? (
        <HiddenLists
          api={api}
          signIn={signIn}
          onSignIn={onSignIn}
          spots={spots}
          onSpotRenamed={onSpotRenamed}
          onSpotsMerged={onSpotsMerged}
          now={now}
        />
      ) : (
        <KeyForm api={api} onSignIn={onSignIn} />
      )}
    </PageShell>
  );
}

function KeyForm({ api, onSignIn }: Pick<Props, 'api' | 'onSignIn'>) {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const nameId = useId();
  const nameHintId = useId();
  const [problem, setProblem] = useState<MessageDescriptor | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const hintId = useId();

  const check = async (e: FormEvent) => {
    e.preventDefault();
    const typed = key.trim();
    // The hash never works as a key; say why without spending one of the limited tries.
    if (looksLikeKeyHash(typed)) {
      setProblem(m.hashPasted);
      return;
    }
    setBusy(true);
    try {
      const signIn = { key: typed, name: name.trim() };
      await api.check(signIn);
      onSignIn(signIn);
    } catch (error) {
      if (isKeyRejected(error)) setProblem(m.wrongKey);
      else if (error instanceof ApiError && error.status === 429) setProblem(m.tooMany);
      else setProblem(m.unreachable);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="field-form" onSubmit={(e) => void check(e)}>
      <label htmlFor={inputId} className="field-label">
        <FormattedMessage {...m.keyLabel} />
      </label>
      <p id={hintId} className="screen-hint">
        <FormattedMessage {...m.keyHint} />
      </p>
      <input
        id={inputId}
        type="password"
        className="field-input"
        required
        autoComplete="current-password"
        aria-describedby={hintId}
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      <label htmlFor={nameId} className="field-label">
        <FormattedMessage {...m.nameLabel} />
      </label>
      <p id={nameHintId} className="screen-hint">
        <FormattedMessage {...m.nameHint} />
      </p>
      <input
        id={nameId}
        className="field-input"
        required
        autoComplete="name"
        maxLength={NICKNAME_MAX_LENGTH}
        aria-describedby={nameHintId}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {problem && (
        <div role="alert" className="alert alert-error">
          <FormattedMessage {...problem} />
        </div>
      )}
      <button type="submit" className="done-button" disabled={busy}>
        <FormattedMessage {...m.check} />
      </button>
    </form>
  );
}

type PlacesProps = Pick<Props, 'api' | 'onSignIn' | 'onSpotRenamed'> & {
  signIn: AdminSignIn;
  places: AdminSpot[];
  onRenamed: (id: string, name: string) => void;
  onMerged: (keptId: string, name: string, mergedIds: string[]) => void;
};

/** Every place, hidden posters' too, with a Rename button; one place is renamed at a time, inline. */
function Places({ api, signIn, onSignIn, places, onRenamed, onSpotRenamed, onMerged }: PlacesProps) {
  const intl = useIntl();
  const sorted = useSpotsByName(places);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterClose = useRef<string | null>(null);
  const mergeButton = useRef<HTMLButtonElement>(null);
  const focusMergeButton = useRef(false);

  // Closing a form brings back the button that opened it (after a merge, the kept place's); focus goes to it once rendered.
  useEffect(() => {
    if (focusMergeButton.current && !merging) {
      mergeButton.current?.focus();
      focusMergeButton.current = false;
    }
    if (renaming !== null || focusAfterClose.current === null) return;
    buttons.current.get(focusAfterClose.current)?.focus();
    focusAfterClose.current = null;
  });

  const toggle = (id: string) => setTicked((shown) => (shown.includes(id) ? shown.filter((t) => t !== id) : [...shown, id]));
  const tickedPlaces = sorted.filter((s) => ticked.includes(s.id));

  const close = (id: string) => {
    focusAfterClose.current = id;
    setRenaming(null);
  };

  return (
    <section aria-labelledby="places" className="log-section">
      <h2 id="places" className="section-title">
        <FormattedMessage {...m.placesHeading} />
      </h2>
      {sorted.length > 1 && (
        <p className="screen-hint">
          <FormattedMessage {...m.mergeHint} />
        </p>
      )}
      {sorted.length === 0 ? (
        <p className="activity-detail">
          <FormattedMessage {...m.noPlaces} />
        </p>
      ) : (
        <ul className="activity-list" aria-labelledby="places">
          {sorted.map((s) => (
            <li key={s.id} className="activity-item">
              {renaming === s.id ? (
                <RenameForm
                  api={api}
                  signIn={signIn}
                  onSignIn={onSignIn}
                  spot={s}
                  onSaved={(name) => {
                    onRenamed(s.id, name);
                    onSpotRenamed(s.id, name);
                    close(s.id);
                  }}
                  onCancel={() => close(s.id)}
                />
              ) : (
                <>
                  <input
                    type="checkbox"
                    className="merge-tick"
                    aria-label={intl.formatMessage(m.tickPlace, { name: s.name })}
                    checked={ticked.includes(s.id)}
                    onChange={() => toggle(s.id)}
                  />
                  <span className="activity-text">
                    <strong>{s.name}</strong>
                    <span className="activity-detail">
                      <FormattedMessage
                        {...(s.hiddenPoster ? m.placeFeedingsHidden : m.placeFeedings)}
                        values={{ feedings: s.feedings }}
                      />
                    </span>
                  </span>
                  <button
                    type="button"
                    className="admin-button"
                    ref={(button) => {
                      if (button) buttons.current.set(s.id, button);
                      else buttons.current.delete(s.id);
                    }}
                    aria-label={intl.formatMessage(m.renamePlace, { name: s.name })}
                    onClick={() => setRenaming(s.id)}
                  >
                    <FormattedMessage {...m.rename} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {merging ? (
        <MergeForm
          api={api}
          signIn={signIn}
          onSignIn={onSignIn}
          places={tickedPlaces}
          onMerged={(keptId, name, mergedIds) => {
            onMerged(keptId, name, mergedIds);
            setTicked([]);
            setMerging(false);
            focusAfterClose.current = keptId;
          }}
          onCancel={() => {
            focusMergeButton.current = true;
            setMerging(false);
          }}
        />
      ) : (
        tickedPlaces.length > 1 && (
          <button ref={mergeButton} type="button" className="admin-button" onClick={() => setMerging(true)}>
            <FormattedMessage {...m.mergeStart} values={{ count: tickedPlaces.length }} />
          </button>
        )
      )}
    </section>
  );
}

type MergeFormProps = Pick<Props, 'api' | 'onSignIn'> & {
  signIn: AdminSignIn;
  places: AdminSpot[];
  onMerged: (keptId: string, name: string, mergedIds: string[]) => void;
  onCancel: () => void;
};

/** Pick the place to keep (the busiest at first) and maybe a new name; says what moves before anything does. */
function MergeForm({ api, signIn, onSignIn, places, onMerged, onCancel }: MergeFormProps) {
  const intl = useIntl();
  const [keepId, setKeepId] = useState(() => places.reduce((a, b) => (b.feedings > a.feedings ? b : a)).id);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<MessageDescriptor | null>(null);
  const [busy, setBusy] = useState(false);
  const keepRadio = useRef<HTMLInputElement>(null);
  const group = useId();
  const nameId = useId();
  const problemId = useId();

  useEffect(() => keepRadio.current?.focus(), []);

  const kept = places.find((p) => p.id === keepId)!;
  const others = places.filter((p) => p.id !== keepId);
  const name = draft.trim();

  const merge = async (e: FormEvent) => {
    e.preventDefault();
    const mergedIds = others.map((o) => o.id);
    setBusy(true);
    try {
      await api.mergeSpots(signIn, keepId, mergedIds, name || undefined);
      onMerged(keepId, name || kept.name, mergedIds);
    } catch (error) {
      const codes = error instanceof ApiError ? error.codes : [];
      if (isKeyRejected(error)) onSignIn(null);
      else if (codes.includes('name.taken')) setProblem(m.nameTaken);
      else setProblem(m.actionFailed);
      setBusy(false);
    }
  };

  return (
    <form className="field-form" onSubmit={(e) => void merge(e)}>
      <fieldset className="merge-keep">
        <legend className="field-label">
          <FormattedMessage {...m.mergeKeep} />
        </legend>
        {places.map((p) => (
          <label key={p.id} className="merge-choice">
            <input
              ref={p.id === keepId ? keepRadio : undefined}
              type="radio"
              name={group}
              className="merge-radio"
              checked={p.id === keepId}
              onChange={() => setKeepId(p.id)}
            />
            {p.name}
          </label>
        ))}
      </fieldset>
      <label htmlFor={nameId} className="field-label">
        <FormattedMessage {...m.mergeNewName} />
      </label>
      <input
        id={nameId}
        className="field-input"
        maxLength={SPOT_NAME_MAX_LENGTH}
        aria-describedby={problem ? problemId : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      {problem && (
        <div id={problemId} role="alert" className="alert alert-error">
          <FormattedMessage {...problem} />
        </div>
      )}
      <p className="admin-question">
        <FormattedMessage
          {...m.mergeConfirm}
          values={{
            others: intl.formatList(others.map((o) => o.name), { type: 'conjunction' }),
            kept: kept.name,
            feedings: others.reduce((sum, o) => sum + o.feedings, 0),
          }}
        />
      </p>
      {name && (
        <p>
          <FormattedMessage {...m.mergeRenamed} values={{ kept: kept.name, name }} />
        </p>
      )}
      <div className="admin-buttons">
        <button type="submit" className="admin-confirm-button" disabled={busy}>
          <FormattedMessage {...m.merge} />
        </button>
        <button type="button" className="admin-button" onClick={onCancel}>
          <FormattedMessage {...m.mergeCancel} />
        </button>
      </div>
    </form>
  );
}

type RenameFormProps = Pick<Props, 'api' | 'onSignIn'> & {
  signIn: AdminSignIn;
  spot: AdminSpot;
  onSaved: (name: string) => void;
  onCancel: () => void;
};

function RenameForm({ api, signIn, onSignIn, spot, onSaved, onCancel }: RenameFormProps) {
  const [draft, setDraft] = useState(spot.name);
  const [problem, setProblem] = useState<MessageDescriptor | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const problemId = useId();

  useEffect(() => input.current?.focus(), []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    setBusy(true);
    try {
      await api.renameSpot(signIn, spot.id, name);
      onSaved(name);
    } catch (error) {
      const codes = error instanceof ApiError ? error.codes : [];
      if (isKeyRejected(error)) onSignIn(null);
      else if (codes.includes('name.taken')) setProblem(m.nameTaken);
      else if (codes.includes('name.required')) setProblem(m.nameRequired);
      else setProblem(m.actionFailed);
      setBusy(false);
    }
  };

  return (
    <form className="field-form place-form" onSubmit={(e) => void save(e)}>
      <label htmlFor={inputId} className="field-label">
        <FormattedMessage {...m.newName} />
      </label>
      <input
        id={inputId}
        ref={input}
        className="field-input"
        required
        maxLength={SPOT_NAME_MAX_LENGTH}
        aria-describedby={problem ? problemId : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      {problem && (
        <div id={problemId} role="alert" className="alert alert-error">
          <FormattedMessage {...problem} />
        </div>
      )}
      <div className="admin-buttons">
        <button type="submit" className="admin-confirm-button" disabled={busy}>
          <FormattedMessage {...m.save} />
        </button>
        <button type="button" className="admin-button" onClick={onCancel}>
          <FormattedMessage {...m.cancel} />
        </button>
      </div>
    </form>
  );
}

function HiddenLists({ api, signIn, onSignIn, spots, onSpotRenamed, onSpotsMerged, now }: Props & { signIn: AdminSignIn }) {
  const intl = useIntl();
  const [entries, setEntries] = useState<KingEventView[] | null>(null);
  const [devices, setDevices] = useState<HiddenDevice[] | null>(null);
  const [places, setPlaces] = useState<AdminSpot[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  // Counts changes made here, so the activity log reloads and shows them.
  const [changes, setChanges] = useState(0);

  // A key the server no longer accepts (rotated) is forgotten, which brings back the key form.
  useEffect(() => {
    Promise.all([api.hiddenEntries(signIn), api.hiddenDevices(signIn), api.listSpots(signIn)]).then(
      ([hiddenEntries, hiddenDevices, allPlaces]) => {
        setEntries(hiddenEntries);
        setDevices(hiddenDevices);
        setPlaces(allPlaces);
      },
      (error: unknown) => (isKeyRejected(error) ? onSignIn(null) : setLoadFailed(true)),
    );
  }, [api, signIn, onSignIn]);

  const act = async (action: () => Promise<void>, done: () => void) => {
    try {
      await action();
      setActionFailed(false);
      setChanges((n) => n + 1);
      done();
    } catch (error) {
      if (isKeyRejected(error)) onSignIn(null);
      else setActionFailed(true);
    }
  };

  const showAgain = (id: string) =>
    act(() => api.unhideEntry(signIn, id), () => setEntries((shown) => shown?.filter((e) => e.id !== id) ?? null));
  // A restored poster's places lose their mark; which ones they are only the server knows.
  const restore = (id: string) =>
    act(
      async () => {
        await api.restoreDevice(signIn, id);
        setPlaces(await api.listSpots(signIn));
      },
      () => setDevices((shown) => shown?.filter((d) => d.id !== id) ?? null),
    );
  const renamed = (id: string, name: string) => {
    setPlaces((shown) => shown?.map((p) => (p.id === id ? { ...p, name } : p)) ?? null);
    setChanges((n) => n + 1);
  };
  // Every feeding at the merged places now counts at the kept one (the counts include hidden feedings, so the sum is exact).
  const merged = (keptId: string, name: string, mergedIds: string[]) => {
    setPlaces((shown) => {
      if (!shown) return null;
      const moved = shown.filter((p) => mergedIds.includes(p.id)).reduce((sum, p) => sum + p.feedings, 0);
      return shown
        .filter((p) => !mergedIds.includes(p.id))
        .map((p) => (p.id === keptId ? { ...p, name, feedings: p.feedings + moved } : p));
    });
    onSpotsMerged(keptId, name, mergedIds);
    setChanges((n) => n + 1);
  };
  const timeOf = (e: KingEventView) => intl.formatDate(new Date(e.occurredAt), { month: 'short', day: 'numeric' });
  const sameYear = (iso: string) => new Date(iso).getFullYear() === now.getFullYear();
  const dateOf = (iso: string) =>
    intl.formatDate(new Date(iso), { month: 'short', day: 'numeric', ...(sameYear(iso) ? {} : { year: 'numeric' as const }) });

  let lists;
  if (loadFailed) {
    lists = (
      <div role="alert" className="alert alert-error">
        <FormattedMessage {...m.loadFailed} />
      </div>
    );
  } else if (!entries || !devices || !places) {
    lists = (
      <p role="status">
        <FormattedMessage {...m.loading} />
      </p>
    );
  } else {
    lists = (
      <>
        <Places
          api={api}
          signIn={signIn}
          onSignIn={onSignIn}
          places={places}
          onRenamed={renamed}
          onSpotRenamed={onSpotRenamed}
          onMerged={merged}
        />
        {actionFailed && (
          <div role="alert" className="alert alert-error">
            <FormattedMessage {...m.actionFailed} />
          </div>
        )}
        <section aria-labelledby="hidden-entries" className="log-section">
          <h2 id="hidden-entries" className="section-title">
            <FormattedMessage {...m.entriesHeading} />
          </h2>
          {entries.length === 0 ? (
            <p className="activity-detail">
              <FormattedMessage {...m.noEntries} />
            </p>
          ) : (
            <ul className="activity-list" aria-labelledby="hidden-entries">
              {entries.map((e) => (
                <ActivityItem
                  key={e.id}
                  event={e}
                  spots={spots}
                  time={timeOf(e)}
                  actions={
                    <div className="admin-buttons">
                      <button type="button" className="admin-button" onClick={() => void showAgain(e.id)}>
                        <FormattedMessage {...m.showAgain} />
                      </button>
                    </div>
                  }
                />
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="hidden-posters" className="log-section">
          <h2 id="hidden-posters" className="section-title">
            <FormattedMessage {...m.postersHeading} />
          </h2>
          {devices.length === 0 ? (
            <p className="activity-detail">
              <FormattedMessage {...m.noPosters} />
            </p>
          ) : (
            <ul className="activity-list" aria-labelledby="hidden-posters">
              {devices.map((d) => (
                <li key={d.id} className="activity-item">
                  <span className="activity-text">
                    <strong>{d.reporterName ?? intl.formatMessage(common.aNeighbor)}</strong>
                    <span className="activity-detail">
                      <FormattedMessage {...m.poster} values={{ entries: d.entries, spots: d.spots, when: dateOf(d.hiddenAt) }} />
                    </span>
                  </span>
                  <button type="button" className="admin-button" onClick={() => void restore(d.id)}>
                    <FormattedMessage {...m.restore} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </>
    );
  }

  return (
    <>
      <p className="screen-hint">
        <FormattedMessage
          {...m.howToHide}
          values={{
            history: (chunks) => (
              <Link to="history" className="text-link">
                {chunks}
              </Link>
            ),
          }}
        />
      </p>
      {lists}
      <Activity api={api} signIn={signIn} onSignIn={onSignIn} changes={changes} now={now} />
      <button type="button" className="admin-button" onClick={() => onSignIn(null)}>
        <FormattedMessage {...m.signOut} />
      </button>
    </>
  );
}

type ActivityProps = Pick<Props, 'api' | 'onSignIn' | 'now'> & { signIn: AdminSignIn; changes: number };

/** The audit log, newest first, a page at a time; it reloads whenever `changes` counts another change made here. */
function Activity({ api, signIn, onSignIn, changes, now }: ActivityProps) {
  const intl = useIntl();
  const [records, setRecords] = useState<ActivityRecord[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const firstOlder = useRef<HTMLLIElement>(null);

  // A key the server no longer accepts (rotated) is forgotten, which brings back the key form.
  const failedWith = (error: unknown) => (isKeyRejected(error) ? onSignIn(null) : setFailed(true));

  useEffect(() => {
    api.activity(signIn).then(
      (page) => {
        setRecords(page.records);
        setNext(page.next);
        setFailed(false);
      },
      (error: unknown) => (isKeyRejected(error) ? onSignIn(null) : setFailed(true)),
    );
  }, [api, signIn, onSignIn, changes]);

  // Keyboard and screen-reader users land on the first line they asked for.
  useEffect(() => firstOlder.current?.focus(), [focusId]);

  const showOlder = async (before: string) => {
    setLoadingOlder(true);
    try {
      const page = await api.activity(signIn, before);
      setRecords((shown) => [...(shown ?? []), ...page.records]);
      setNext(page.next);
      setFocusId(page.records[0]?.id ?? null);
    } catch (error) {
      failedWith(error);
    } finally {
      setLoadingOlder(false);
    }
  };

  const sameYear = (iso: string) => new Date(iso).getFullYear() === now.getFullYear();
  const day = (iso: string | null) =>
    iso
      ? intl.formatDate(new Date(iso), { month: 'short', day: 'numeric', ...(sameYear(iso) ? {} : { year: 'numeric' as const }) })
      : '';
  const moment = (iso: string) =>
    intl.formatDate(new Date(iso), {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      ...(sameYear(iso) ? {} : { year: 'numeric' as const }),
    });

  const what = ({ action, touched: t }: ActivityRecord) => {
    const poster = t.posterName ?? intl.formatMessage(common.aNeighbor);
    const entry = {
      kind: t.entryKind ?? 'seen',
      poster,
      hasPlace: t.placeName ? 'yes' : 'no',
      place: t.placeName ?? '',
      when: day(t.entryAt),
    };
    const counts = { poster, entries: t.entries ?? 0, spots: t.spots ?? 0 };
    switch (action) {
      case 'signIn':
        return intl.formatMessage(m.signedIn);
      case 'signInFailed':
        return intl.formatMessage(m.wrongKeyTried);
      case 'hideEntry':
        return intl.formatMessage(m.hidEntry, entry);
      case 'showEntry':
        return intl.formatMessage(m.showedEntry, entry);
      case 'hidePoster':
        return intl.formatMessage(m.hidPoster, counts);
      case 'restorePoster':
        return intl.formatMessage(m.restoredPoster, counts);
      case 'renamePlace':
        return intl.formatMessage(m.renamedPlace, { from: t.placeName ?? '', to: t.newName ?? '' });
      case 'mergePlaces':
        return intl.formatMessage(m.mergedPlaces, {
          merged: intl.formatList(t.mergedNames ?? [], { type: 'conjunction' }),
          kept: t.placeName ?? '',
          renamed: t.newName ? 'yes' : 'no',
          newName: t.newName ?? '',
          feedings: t.feedings ?? 0,
        });
    }
  };

  let body;
  if (records === null) {
    body = failed ? null : (
      <p role="status">
        <FormattedMessage {...m.activityLoading} />
      </p>
    );
  } else if (records.length === 0) {
    body = (
      <p className="activity-detail">
        <FormattedMessage {...m.noActivity} />
      </p>
    );
  } else {
    body = (
      <ul className="activity-list" aria-labelledby="activity">
        {records.map((r) => (
          <li key={r.id} className="activity-item" tabIndex={-1} ref={r.id === focusId ? firstOlder : undefined}>
            <span className="activity-text">
              <strong>{what(r)}</strong>
              <span className="activity-detail">
                <FormattedMessage
                  {...m.activityBy}
                  values={{
                    name: r.adminName ?? intl.formatMessage(m.noName),
                    address: r.address ?? intl.formatMessage(m.unknownAddress),
                    when: moment(r.at),
                  }}
                />
              </span>
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="activity" className="log-section">
      <h2 id="activity" className="section-title">
        <FormattedMessage {...m.activityHeading} />
      </h2>
      <p className="screen-hint">
        <FormattedMessage {...m.activityNote} />
      </p>
      {failed && (
        <div role="alert" className="alert alert-error">
          <FormattedMessage {...m.activityFailed} />
        </div>
      )}
      {body}
      {next !== null && (
        <button type="button" className="admin-button" disabled={loadingOlder} onClick={() => void showOlder(next)}>
          <FormattedMessage {...m.showOlderActivity} />
        </button>
      )}
    </section>
  );
}

# web-audio-sequencing

## Table of Contents

- [About](#about)
- [Motivation](#motivation)
- [Overview](#overview)
  - [Time](#time)
  - [Transport](#transport)
  - [Clock](#clock)
  - [Clip](#clip)
  - [ClipPlayer](#clipplayer)
  - [NoteProcessor](#noteprocessor)
  - [ClipPlayer: Going Deeper](#clipplayer-going-deeper)
  - [Looping](#looping)
- [Caveats](#caveats)
- [Requirements](#requirements)
- [Getting Started](#getting-started)
  - [Integrating the code](#integrating-the-code)
- [Examples](#examples)
- [Alternatives](#alternatives)
- [License](#license)
- [Contributing](#contributing)
- [Maintainers](#maintainers)

# About

This repository contains code that allows you to easily schedule events in _musical_ time when working with the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API). This can be useful if you're interested in creating applications which include features common to music-production software like MIDI sequencers or ["session"](https://www.ableton.com/en/manual/session-view/) clip players.

# Motivation

Let's assume you're interested in creating a browser-based application that allows people to sequence beats, melodies, or harmonies. To accomplish this, you might choose to present a UI common to many DAWs (Digital Audio Workstations) known as a ["piano roll"](https://learningmusic.ableton.com/make-melodies/play-with-melodies.html). This interface (usually) allows musicians to sequence notes against a musical grid, adjust the timing of these notes (when they start and end), and select a region of time in order to create looping patterns of notes. When listening, musicians will expect to be able to adjust the speed (tempo) at which their sequence plays back.

The [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) provides everything that is _technically_ necessary to create such an application. However, actually realizing the implementation can prove to be surprisingly tricky, especially when it comes to satisfying a fundamental musical requirement: making sure the notes always play and stop at precisely the right time!

In his article, ["A Tale of Two Clocks"](https://web.dev/articles/audio-scheduling) Chris Wilson explains why this is challenging to implement in the browser, how naive implementations degrade in subtle ways, and outlines a conceptual model for achieving stable audio sequencing/playback using a small collection of browser APIs. The code in this repository can be thought of as one possible implementation of Chris' approach which is tailored towards supporting common DAW-like features. We recommend reading his article before continuing.

# Overview

Here's a brief overview of the various concepts and components in this repository.

## Time

The Web Audio API has no notion of _musical_ time. As far as Web Audio is concerned, everything happens according to _clock time_. Events are scheduled at a particular time (in seconds) since the [`AudioContext`](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext) began processing. This model is simple and allows for precisely scheduling events. However - for many musical applications - this presents a slight challenge because you often want to be thinking, modelling, and coding in musical time (e.g. "this quarter note starts on the 3rd beat" rather than "this note is 0.5 seconds long, and starts 1.5 seconds into the composition").

In the provided code, you'll find that we use a different unit of time. Rather than seconds, we use "beat time". A quarter note might start at a `beatTime` of 1, and end at a `beatTime` of 2. A whole note might start at a `beatTime` of 4, and end at a `beatTime` of 8 (assuming a 4/4 time signature).

Using beat times also ensures that we can introduce `tempo` (beats per minute) as a more meaningful concept. A note starts at a `beatTime` of 1 regardless of the tempo at which the sequence is playing. If everything were stored using clock times (seconds), the start time (and duration) of a note would implicitly change due to a change in tempo.

## Transport

The `Transport` is responsible for mapping between clock time and beat time, taking the current tempo into account. In other words, it provides the necessary information for resolving a `beatTime` to a `clockTime` which can then be passed to the Web Audio API. You can also think of it as providing a `beatTime` "timeline" for event scheduling.

## Clock

The `Clock` is responsible for providing a stable, periodic callback. In essence, it "drives" the transport's `beatTime` timeline forward at a specified periodic interval.

Note that the `Clock` runs within a web-worker to avoid main-thread congestion.

## Clip

A Clip is a container for musical notes (events). Clips can be scheduled to play at a particular point on the `Transport`'s timeline. They can also be configured to loop indefinitely.

## Note

A `Note` is comprised of events which occur at different _stages_ of the note's lifetime. Notes have a `Start` event, `End` event, and can optionally also have `Update` events. Crucially, notes have an `id`, which allows the sequencing code to associate the disparate events which correspond to a single `Note`.

## ClipPlayer

The `ClipPlayer` is responsible for ensuring that the notes (events) inside a `Clip` are scheduled in a timely manner against the Web Audio API. The `ClipPlayer` uses information provided by the `Transport` to convert the `beatTime` values for notes (events) into `clockTime` values which can then be passed to various functions in the Web Audio API (e.g. [OscillatorNode](https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode) `start()`, `stop()`).

The `ClipPlayer` also handles a number of tricky situations which are common to non-trivial audio applications. For example,

- Scheduling looped playback of clips.
- Stopping playing notes when the `Transport` stops.
- Stopping playing notes that overlap a clip's loop boundaries.
- Stopping playing notes that are affected by changes to a clip's loop boundaries.

The `ClipPlayer` is truly the heart of this repository. You can find more detailed information later in the README.

## NoteProcessor

The notes in a clip can be thought of as data. This data specifies when notes should begin and end in relation to musical beat time. When these notes are actually played (scheduled), you can imagine that a new, ephemeral "note" is being instantiated for playback. To map between the source (data) note, and the scheduled (actually playing note), we use the `NoteProcessor`.

## `ClipPlayer`: Going Deeper

> Before we launch into the details of the `ClipPlayer`, please take a minute to read ["A Tale of Two Clocks"](https://web.dev/articles/audio-scheduling) if you haven't already.

The main job of the `ClipPlayer` is to convert clip data (notes and events) which are specified in musical `beatTime` into `clockTime` values which can then be handed over to the browser in order to generate sound.

To accomplish this _with the Web Audio API_, the `ClipPlayer` needs to employ a technique called "lookahead" scheduling.

In broad strokes, the idea of lookahead scheduling is to periodically "look ahead" to determine what events (play a note, end a note, etc.) are meant to occur in the very near future. Events in the very near future are then scheduled using functions like `OscillatorNode.start()` to actually generate sound.

Each time we peek into the near future to see what needs to be scheduled, we call that a scheduling "pass".

In terms of our `ClipPlayer` code, each pass happens when the `ClipPlayer` receives an event from the `Transport` (`onTransportEvent()`).

Each transport `playback` event has a `nextBeatTime` field, which tells the `ClipPlayer` how far into the future it can/should schedule events (what we consider to be the very-near-future). Once an event is scheduled, it should not be scheduled again.

To achieve lookahead scheduling without scheduling events multiple times, we employ the idea of a "scheduling window". The window is modelled as a pair of beat time values. These define a window into the future that might contain events that need to be scheduled.

- `LeadingEdge` (exclusive)
- `TrailingEdge` (inclusive)

On each scheduling pass, we schedule all events that lie at or after the `TrailingEdge`, and strictly before the `LeadingEdge`.

The `LeadingEdge` tells us how far into the future we're allowed to schedule events (exclusive) for any given scheduling pass, and the `TrailingEdge` gives us a beat time for which we can be certain that all events earlier or equal in time have been scheduled.

In any given scheduling pass, if an event lies within the
window, we know that it's safe to schedule. i.e.:

- It hasn't already been scheduled.
- It isn't _too_ far into the future.

Visually, the "scheduling window" works a bit like this for a few simple scheduling passes. `a`, `b`, and `c` are events that might correspond (for example) to events like the start or end of a note.

---

### Pass 1: Event `a` should be scheduled, because it lies within the window.

Event `b` and `c` should not be scheduled, because they lie outside the window (too
far into the future)

```

TE       LE
|        |
|   *a   |     *b          *c
|        |
-------------------------------------------------time-----------
```

### Pass 2: Event `a` should not be scheduled, because it lies outside the scheduling window (already scheduled).

However, event `b` should be scheduled, because it now lies
within the scheduling window. Event `c` should not be scheduled, because it lies outside the window (too far into the future)

```

         TE       LE
         |        |
    *a   |     *b |        *c
         |        |
-------------------------------------------------time-----------
```

### Pass 3: Event `a` and `b` should not be scheduled, because they lie outside the scheduling window (already scheduled).

However, Event `c` should not be scheduled, because the
LeadingEdge is exclusive.

```
                  TE       LE
                  |        |
    *a         *b |        *c
                  |        |
-------------------------------------------------time-----------
```

### Pass 4: Event a and b should not be scheduled, because they lie outside the scheduling window (already scheduled).

Now, Event `c` should be scheduled, because the TrailingEdge is inclusive (Event `c` now lies within the window).

```
                           TE       LE
                           |        |
    *a         *b          *c       |
                           |        |
-------------------------------------------------time-----------
```

## Looping

The visualizations above correspond to a sequence of straightforward scheduling passes. Things get considerably more interesting when one considers how looping affects lookahead scheduling.

In the visualization below, we have a short clip that is set to loop. It has one event (`a`). When doing a scheduling pass, it might be the case that the window encompasses multiple _iterations_ of this loop:

```
.TE  .                         LE
.|   .                         |
.|*a .                         |
.|   .                         |
.LOOP.----------------------------------------------time-----------
```

In this case, the `ClipPlayer` needs to be smart enough to "unroll" the loop to ensure that subsequent iterations of the loop and its events are also scheduled within the current window:

```
.TE  .    ,    ,    ,    ,    ,LE
.|   .    ,    ,    ,    ,    ,|
.|*a . ^a , ^a , ^a , ^a , ^a ,|
.|   .    ,    ,    ,    ,    ,|
.LOOP.----------------------------------------------time-----------
```

In other words, the `ClipPlayer` needs to _project_ the loop out into the future, and schedule the "unrolled" iterations of the `a` event. When combining short loops and very high tempos, the number of iterations can end up being quite high!

---

Hopefully the sections above should give you a sense of the complexity involved in implementing something so seemingly simple as playing looping notes in a melody or drum beat with the Web Audio API.

If you'd like to dig deeper, play around with the examples and edit the included `.test.ts` files to check your understanding of the lookahead scheduling concept.

# Caveats

Here are a few caveats to consider before using this code:

- When changing `Transport.tempo` or the active range boundaries of a clip, a mapping of the transport `beatTime` to a clip `beatTime` may appear to jump to its next computed value.
- All potential edge cases in this code have not been rigorously tested. However, the code has been used in prototypes and publicly available sites for a number of years without issue.

# Requirements

This is intended for use in environments that support Web Audio API. It is untested in non-browser contexts.

The [source code](./src/) is written in ES6 syntax, and uses platform APIs such as [structuredClone](https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone) for deep cloning, and [crypto.randomUUID()](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID) for generating unique identifiers. It would be trivial to replace these with compatible alternatives for your requirements.

This meets the criteria for [Baseline Widely Available](https://web.dev/baseline) with supported browser versions: Chrome 98+, Firefox 94+, Safari 15.4+, Edge 98+.

# Getting Started

We recommend vendoring this code. There are no runtime dependencies and in [dist](./dist/) you can find the build output with generated TypeScript definition files.

If you wish to make changes and re-run the builds, do so by running the `build` script defined in [`package.json`](./package.json). This will use `tsc` to compile the source code. There are a number of tests available, and you may wish to check that these still pass after making edits by using the `test` script which runs Vitest.

## Integrating the code

Follow the steps below, or see a minimal snippet in the expandable content that follows.

<details>
<summary>
Minimal snippet
</summary>

```js
import {
  Clock,
  Transport,
  ClipPlayer,
  NoteEventStage,
  EventType,
} from "@ableton/web-audio-sequencing";

const audioContext = new AudioContext();

const clock = new Clock(audioContext);
const clipPlayer = new ClipPlayer(onClipEvent, false);
const transport = new Transport(clock, onTransportEvent);

function onTransportEvent(event) {
  clipPlayer.onTransportEvent(event);
  switch (event.type) {
    case EventType.TransportPlayback: {
      break;
    }
    case EventType.TransportStop: {
      break;
    }
  }
}

function onClipEvent(audioContextTime, transportTime, clipId, event) {
  switch (event.stage) {
    case NoteEventStage.Start: {
      break;
    }
    case NoteEventStage.InstantaneousStartEnd: {
      break;
    }
    case NoteEventStage.Update: {
      break;
    }
    case NoteEventStage.End: {
      break;
    }
  }
}

const clip = {
  events: [
    {
      noteId: "foo",
      stage: NoteEventStage.Start,
      beatTime: 0,
      data: {
        frequency: 220,
      },
    },
    {
      noteId: "foo",
      stage: NoteEventStage.End,
      beatTime: 1,
      data: {
        frequency: 220,
      },
    },
  ],
  id: "clip",
  startInTransportBeats: 0,
  endInTransportBeats: 4,
  activeRangeStartBeatTime: 0,
  activeRangeEndBeatTime: 4,
  shouldLoop: true,
};

clipPlayer.addClip(clip);
transport.start();

// When finished, cleanup:
function cleanup() {
  transport.cleanup();
  clock.cleanup();
}
```

</details>

Given the Web Audio API domain, first create an AudioContext.

```js
const audioContext = new AudioContext();
```

Then import the build output. For clarity we are calling this package `@ableton/web-audio-sequencing`. You might need to provide this or an alternative import mapping to where you put your files.

```js
import { Clock, Transport, ClipPlayer } from "@ableton/web-audio-sequencing";
```

Next up we need to wire these together:

```js
const clock = new Clock(audioContext);
const clipPlayer = new ClipPlayer(onClipEvent, false);
const transport = new Transport(clock, onTransportEvent);
```

The `ClipPlayer` and `Transport` classes expect event handlers to be provided so let's stub these out:

```js
/**
 * @param {number} audioContextTime
 * @param {number} transportTime
 * @param {string} clipId
 * @param {IClipEvent<TEventData>} event
 */
function onClipEvent(audioContextTime, transportTime, clipId, event) {}

/**
 * @param {ITransportEvent} event
 */
function onTransportEvent(event) {}
```

You may have noticed there's a boolean argument passed to the `ClipPlayer` constructor which determines how events that intersect the active range of a clip should be handled - if `true` then the `ClipPlayer` will wrap intersecting events around the active range, otherwise it will gracefully end them.

Let's focus on the transport. Start playback:

```js
transport.start();
```

Adjust the tempo in beats per minute:

```js
transport.setTempo(200);
```

Stop playback:

```js
transport.stop();
```

Lastly, query the current transport state:

```js
const playingState = transport.getState();
```

Next we create a clip. The type definitions for a clip can be found in [src/clip.ts](./src/clip.ts). Clips added to a `ClipPlayer` must have a unique `id`. Additionally it requires beat time values that instructs the `ClipPlayer` when to start and end playing the clip according to the transport beat time, and the active time range within the clip that should play. The below clip will start playing when the transport starts (0 beat time), and after a bar (4 beats) will start looping as `shouldLoop: true` and the active range properties determine that the loop has a length of 4 beats. Any events whose beat time lies within this active range will be processed.

```js
const clip = {
  id: "clip-0",
  startInTransportBeats: 0,
  endInTransportBeats: 4,
  activeRangeStartBeatTime: 0,
  activeRangeEndBeatTime: 4,
  shouldLoop: true,
  events: [],
};
```

Add the clip to the `clipPlayer`.

```js
clipPlayer.addClip(clip);
```

If you wish to have a clip that starts at a point after the `transport` is started, then set `startInTransportBeats` to a value greater than 0 in beat time.

```js
const clip = {
  id: "clip-1",
  startInTransportBeats: 2,
  endInTransportBeats: 4,
  activeRangeStartBeatTime: 0,
  activeRangeEndBeatTime: 4,
  shouldLoop: true,
  events: [],
};
```

Looping isn't a requirement. The below clip will start playing after 2 beats and end 2 beats later.

```js
const clip = {
  id: "clip-2",
  startInTransportBeats: 2,
  endInTransportBeats: 4,
  activeRangeStartBeatTime: 0,
  activeRangeEndBeatTime: 4,
  shouldLoop: false,
  events: [],
};
```

A clip may loop with varying ranges - for example, this clip would loop four times per beat.

```js
const clip = {
  id: "clip-3",
  startInTransportBeats: 0,
  endInTransportBeats: 4,
  activeRangeStartBeatTime: 0,
  activeRangeEndBeatTime: 0.25,
  shouldLoop: true,
  events: [],
};
```

Next, add some events. An event needs four properties:
a `noteId`, `stage`, `beatTime`, and `data`. A `noteId` does not have to be unique, in fact it is helpful for note on/off pairs to have a shared `noteId`. `stage` defines whether the event is a `Start`, `End`, `InstantaneousStartEnd` or `Update`. This supports scheduling note starts and ends (including one‑shot notes) as well as updating parameters while a note is playing. The `beatTime` property determines when this event should be scheduled. Finally, the `data` property is a generic type which can be used to pack arbitrary information into these events. Typically we might use this to store information such as `frequency` or `velocity`.

For example, to schedule a note lasting one beat use a pair of events with a Start and End stage respectively:

```js
import { NoteEventStage } from "@ableton/web-audio-sequencing";
const clip = {
  events: [
    {
      noteId: "foo",
      stage: NoteEventStage.Start,
      beatTime: 0,
      data: {
        frequency: 220,
      },
    },
    {
      noteId: "foo",
      stage: NoteEventStage.End,
      beatTime: 1,
      data: {
        frequency: 220,
      },
    },
  ],
  id: "clip-4",
  startInTransportBeats: 0,
  endInTransportBeats: 4,
  activeRangeStartBeatTime: 0,
  activeRangeEndBeatTime: 4,
  shouldLoop: true,
};
```

For cases such as triggering one-shot drum samples which don't require control over the end time, use a `InstantaneousStartEnd` stage. This tells the `ClipPlayer` to schedule a start event and treat it as self-ending.

```js
const clip = {
  events: [
    {
      noteId: "foo",
      stage: NoteEventStage.InstantaneousStartEnd,
      beatTime: 0,
      data: {
        frequency: 220,
      },
    },
  ],
  id: "clip-5",
  startInTransportBeats: 0,
  endInTransportBeats: 4,
  activeRangeStartBeatTime: 0,
  activeRangeEndBeatTime: 4,
  shouldLoop: true,
};
```

Additionally, the `Update` stage permits scheduling updates, such as change parameters on audio nodes across the lifetime of a note event - connected by `noteId`. For example, update `data.frequency` one beat after the note starts.

```js
const clip = {
  events: [
    {
      noteId: "foo",
      stage: NoteEventStage.Start,
      beatTime: 0,
      data: {
        frequency: 220,
      },
    },
    {
      noteId: "foo",
      stage: NoteEventStage.Update,
      beatTime: 1,
      data: {
        frequency: 440,
      },
    },
    {
      noteId: "foo",
      stage: NoteEventStage.End,
      beatTime: 2,
      data: {
        frequency: 440,
      },
    },
  ],
  id: "clip-6",
  startInTransportBeats: 0,
  endInTransportBeats: 4,
  activeRangeStartBeatTime: 0,
  activeRangeEndBeatTime: 4,
  shouldLoop: true,
};
```

The `ClipPlayer` can sequence multiple clips simultaneously. These can have the same or varying start, end, or active range properties. Just be sure that each clip has its own unique id.

```js
const fooClip = {
  id: "foo",
  startInTransportBeats: 2,
  endInTransportBeats: 4,
  activeRangeStartBeatTime: 3,
  activeRangeEndBeatTime: 3.5,
  shouldLoop: true,
  events: [],
};
clipPlayer.addClip(fooClip);

const barClip = {
  id: "bar",
  startInTransportBeats: 0,
  endInTransportBeats: 4,
  activeRangeStartBeatTime: 0,
  activeRangeEndBeatTime: 4,
  shouldLoop: true,
  events: [],
};
clipPlayer.addClip(barClip);
```

You can remove clips, just like it is possible to add clips.

```js
clipPlayer.removeClip(clip.id);
```

To update an existing clip, use `ClipPlayer.updateClip()` rather than accessing a clip via `ClipPlayer.getClip()` and directly mutating it. Calling the `ClipPlayer.updateClip()` method with a new (or cloned) clip object allows the `ClipPlayer` to "diff" the current clip with the updated clip and ensure that playing notes which have been moved (relative to the playhead) or deleted can be gracefully ended.

```js
const newClip = structuredClone(oldClip);
newClip.activeRangeEndBeatTime = 2;
clipPlayer.updateClip(newClip);
```

Let's return to the stubbed `onTransportEvent` and `onClipEvent` functions.

It is imperative when receiving a transport event to invoke the `clipPlayer.onTransportEvent`. This tells the `ClipPlayer` that the `Transport` has advanced, or stopped.

```js
function onTransportEvent(event) {
  clipPlayer.onTransportEvent(event);
}
```

When a `clipPlayer` schedules an event, `onClipEvent` will be called providing
the event. This is where to schedule Audio Nodes, and what you do is entirely up to you! A typical onClipEvent handler may look as follows:

```js
import {
  startVoice,
  endVoice,
  startAndEndVoice,
  updateVoice,
} from "your-audio-node";

function onClipEvent(audioContextTime, transportTime, clipId, event) {
  switch (event.stage) {
    case NoteEventStage.Start: {
      startVoice(audioContextTime, event);
      break;
    }
    case NoteEventStage.InstantaneousStartEnd: {
      startAndEndVoice(audioContextTime, event);
      break;
    }
    case NoteEventStage.Update: {
      updateVoice(audioContextTime, event);
      break;
    }
    case NoteEventStage.End: {
      endVoice(audioContextTime, event);
      break;
    }
  }
}
```

Back to the transport events, we can add logic to the `onTransportEvent` handler to obtain information such as playhead positions.

```js
/**
 * @param {string} clipId
 */
function getPlayheadPositionInBeatTime(clipId) {
  const clip = clipPlayer.getClip(clipId);
  if (!clip) return 0;
  const beats = clipPlayer.transportBeatTimeToClipBeatTime(
    clip,
    transport.currentBeatTime,
  );
  return transport.getState() === TransportState.Running ? beats : 0;
}

function onTransportEvent(event) {
  clipPlayer.onTransportEvent(event);
  const playheadPosition = getPlayheadPositionInBeatTime("clip");
}
```

Last but not least, cleanup when done.

```js
function cleanup() {
  transport.cleanup();
  clock.cleanup();
}
```

# Examples

You can run the `examples` script which will use a development server package (live-server) to run a small webpage where you can view different examples. The code for these examples is found in the [examples directory](./examples/) and the entry point is [examples.html](./examples.html) at the root.

# Alternatives

If you want to see how others have approached the problem of scheduling events in _musical_ time with the Web Audio API, you might be interested in these projects:

- [Tone.js](https://tonejs.github.io/)
- [bap](https://github.com/adamrenklint/bap)
- [Metronome example](https://github.com/cwilso/metronome/)

# License

This software is distributed under the [MIT License](./LICENSE).

# Contributing

At the moment, we're not accepting any contributions or PRs for this repository. However, you should feel free to fork this code and extend it however you'd like!

# Maintainers

- [@jas-ableton](https://github.com/jas-ableton)
- [@gpu-ableton](https://github.com/gpu-ableton)

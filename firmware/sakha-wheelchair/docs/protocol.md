# Sakha Bluetooth Protocol

The HC-05 link uses newline-delimited ASCII commands.

## Commands

```text
PING
STOP
MOVE FORWARD <speed>
MOVE BACKWARD <speed>
MOVE LEFT <speed>
MOVE RIGHT <speed>
```

`speed` is clamped to `0..255` by firmware. The gateway applies a stricter
policy before sending commands so turn speeds and forward speeds can have
different limits.

## Responses

```text
PONG
OK stop
OK move
ERR bad-command
ERR line-too-long
```

## Safety invariants

- A command must end in `\n`; partial commands are ignored until complete.
- Every invalid command transitions to stop.
- The motor stops if no valid command arrives within the watchdog window.
- Natural-language parsing is intentionally outside the Arduino firmware.


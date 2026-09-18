# Sakha Debug Notes

These notes are reconstructed from the verified architecture. They are not
presented as the original 2019-2023 development log.

## Debug flow

1. Voice gate before motion
   - Enrollment must exist before movement commands are allowed.
   - Speaker verification answers "who spoke"; speech recognition answers "what
     was said." Mixing those terms is a common mistake and the code keeps them
     separate.

2. Normalize language before parsing
   - Hindi and English commands map into the same internal direction enum.
   - The Arduino never sees natural language; it only sees `MOVE ...` or `STOP`.

3. Fail closed
   - Unknown transcript sends `STOP`.
   - Unverified speaker sends `STOP`.
   - Firmware line overflow sends `STOP`.
   - Firmware watchdog timeout sends `STOP`.

4. Keep motor claims precise
   - The firmware drives a brushed DC motor driver with PWM and direction pins.
   - No BLDC or autonomous navigation implementation is implied.

## Typical bench checks

| Check | Expected result |
| --- | --- |
| Send `PING` over HC-05 serial | Arduino replies `PONG` |
| Send malformed text | motor stops and firmware replies `ERR bad-command` |
| Disconnect phone during motion | watchdog stops PWM in under one second |
| Speak as non-owner | phone gateway sends `STOP`, not movement |
| Hindi stop command `ruko` | parser emits `STOP` |

## Why the comments are written this way

The comments call out safety boundaries instead of narrating every line. In an
interview, those are the parts that matter: what runs on the phone, what runs on
the Arduino, and why the microcontroller should never be trusted with raw voice
input.


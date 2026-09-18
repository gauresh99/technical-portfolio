# Sakha Wheelchair Retrofit Controller

This is a reconstructed version of the Sakha control stack. The original high
school project code was lost, so this repository keeps the public code honest:
it implements the architecture described in the audit without pretending to be
the original files.

## Verified design

- Manual wheelchair retrofit, not a full powered wheelchair replacement.
- Android or phone-side voice flow:
  enrollment -> speaker verification -> speech-to-text -> Hindi/English command
  normalization -> Bluetooth.
- HC-05 Bluetooth link from phone to Arduino.
- Arduino firmware parses movement commands and drives a brushed DC motor driver
  with PWM speed and direction.
- Safety behavior: commands expire if the link goes quiet.

## Not claimed

- No BLDC motor control in Sakha. The build used brushed DC through an external
  H-bridge style motor driver.
- No autonomous navigation/geofencing code. Those were researched future ideas.
- No named speaker-verification vendor, because the API name was not recovered.

## Layout

```text
firmware/
  sakha_controller.ino   Arduino sketch for HC-05 command parsing and motor PWM
gateway/
  sakha/                 Python gateway modules for verified voice commands
  tests/                 standard-library tests for parser and gating behavior
android/
  BluetoothCommandLink.kt minimal Android Bluetooth sender sketch
```

## Run gateway tests

```bash
python3 -m unittest discover gateway/tests
```

## Command protocol

The Arduino accepts newline-terminated commands:

```text
MOVE FORWARD 170
MOVE BACKWARD 140
TURN LEFT 120
TURN RIGHT 120
STOP
PING
```

Speed values are clamped to `0..255`. If no valid command arrives before the
watchdog timeout, the firmware stops the motor.


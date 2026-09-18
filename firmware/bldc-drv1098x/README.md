# BLDC DRV1098x Motor Driver Bring-Up

This is a reconstructed reference implementation for the BLDC ceiling-fan
bring-up work described in my embedded resume. The original internship code and
motor-specific parameters are not included here. This folder shows the driver
logic I can defend: configuring a TI DRV10983/DRV10987-class integrated
sensorless BLDC driver over I2C, commanding speed through the 9-bit speed
register path, reading hardware telemetry, and mapping reverse exhaust modes.

## What this code claims

- TI DRV1098x-style speed control over I2C.
- Register-level C bring-up code using a small bus abstraction.
- Direction selected through a board GPIO wired to the driver's `DIR` pin.
- Reverse exhaust speed profiles that can be mapped to measured current.
- Host-side tests proving register write ordering and telemetry conversion.

## What this code does not claim

- It does not implement six-step commutation.
- It does not implement an external gate-driver power stage.
- It does not program EEPROM as a completed claim.
- It does not include proprietary Radius Synergies motor data.

The DRV10983/DRV10987 handles commutation internally. The microcontroller's job
is to configure registers, command speed, choose direction through board I/O,
and read back speed/current/fault telemetry.

## Layout

```text
include/
  drv1098x.h          register addresses, bit masks, public driver API
  i2c_bus.h           minimal platform-independent I2C interface
  motor_profile.h     speed/current profile data structures
src/
  drv1098x.c          driver implementation
  motor_profile.c     example reverse-speed profiles
  main.c              bring-up flow using a mock bus for desktop runs
target/
  cycle_wait.S        small AVR wait loop used in hardware builds
tests/
  test_drv1098x.c     host tests for write order and conversions
```

## Build and test

```bash
make
make test
```

The default build is a desktop simulation. On hardware, replace the mock I2C
functions with the MCU's I2C peripheral driver and wire `drv1098x_set_direction`
to the GPIO connected to `DIR`.


# BLDC Bring-Up Notes

These are reconstructed engineering notes, not the original Radius Synergies
internship log. They record the debugging process implied by the code and the
resume audit so an interviewer can see the reasoning without any proprietary
motor data.

## Debug path

1. Identify driver and motor
   - Confirm the fan controller uses a TI DRV10983/DRV10987-family integrated
     sensorless driver.
   - Treat the part as an integrated commutation controller, not an external
     gate driver.

2. Prove I2C writes
   - Read status and speed-command readback before changing motor state.
   - Write `SpeedCtrl2` before `SpeedCtrl1`; the datasheet notes the LSB write
     snapshots the MSB.
   - Keep direction as a GPIO/DIR-pin concern. Do not invent a direction I2C
     register.

3. Characterize motor behavior
   - Sweep a small set of speed commands.
   - Record supply voltage and motor current at each point.
   - Compare against the fan-law expectation instead of claiming an efficiency
     percentage that was never measured.

4. Reverse exhaust mode
   - Stop the motor before changing direction.
   - Enable reverse-drive processing.
   - Apply speed steps conservatively and check faults after each step.

## Typical failure table

| Symptom | Likely cause | First check |
| --- | --- | --- |
| I2C ACK but speed unchanged | override bit not set or MSB/LSB order wrong | inspect writes to `0x01`, then `0x00` |
| Runs open loop then stalls | open-to-closed threshold or Kt mismatch | read `FaultCode`, inspect Lock2/Lock4 |
| Direction does not change | expecting direction over I2C | check board `DIR` pin wiring |
| Current looks impossible | two-byte current conversion wrong | mask `MotorCurrent1[2:0]` only |
| Fault persists after fix | sticky fault bit not cleared/read in sequence | read status/fault after each attempted restart |

## Commenting style

The code comments call out the mistakes that matter in motor-control interviews:
what the microcontroller controls, what the driver chip controls, and where the
datasheet imposes ordering or conversion rules.


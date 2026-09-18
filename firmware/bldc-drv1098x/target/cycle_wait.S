/*
 * Optional AVR bring-up delay loop.
 *
 * The host build uses ordinary C timing. This file documents the kind of small
 * assembly utility I used for deterministic register-bring-up delays on simple
 * microcontroller targets.
 *
 * C prototype:
 *   void cycle_wait(uint16_t loops);
 */

#if defined(__AVR__)
.global cycle_wait
.type cycle_wait, @function
cycle_wait:
1:
    sbiw r24, 1
    brne 1b
    ret
#endif


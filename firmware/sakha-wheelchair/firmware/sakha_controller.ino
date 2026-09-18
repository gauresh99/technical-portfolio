/*
 * Sakha wheelchair retrofit controller.
 *
 * Hardware assumptions:
 * - HC-05 Bluetooth module wired to the Arduino serial port.
 * - External brushed DC motor driver with IN1, IN2 and PWM/enable pins.
 * - Optional left/right steering pins if the mechanical build supports them.
 *
 * The phone-side app must verify the enrolled speaker before sending commands.
 * The firmware still has a watchdog so a dropped link cannot leave the motor on.
 */

const uint8_t PIN_MOTOR_IN1 = 7;
const uint8_t PIN_MOTOR_IN2 = 8;
const uint8_t PIN_MOTOR_PWM = 9;
const uint8_t PIN_STEER_LEFT = 5;
const uint8_t PIN_STEER_RIGHT = 6;

const unsigned long COMMAND_TIMEOUT_MS = 900;
const size_t LINE_LIMIT = 48;

char lineBuffer[LINE_LIMIT];
size_t lineLen = 0;
unsigned long lastCommandMs = 0;

enum Motion {
  MOTION_STOP,
  MOTION_FORWARD,
  MOTION_BACKWARD,
  MOTION_LEFT,
  MOTION_RIGHT
};

void setup() {
  pinMode(PIN_MOTOR_IN1, OUTPUT);
  pinMode(PIN_MOTOR_IN2, OUTPUT);
  pinMode(PIN_MOTOR_PWM, OUTPUT);
  pinMode(PIN_STEER_LEFT, OUTPUT);
  pinMode(PIN_STEER_RIGHT, OUTPUT);

  Serial.begin(9600);
  applyMotion(MOTION_STOP, 0);
  Serial.println("SAKHA READY");
}

void loop() {
  while (Serial.available() > 0) {
    char ch = (char)Serial.read();
    if (ch == '\r') {
      continue;
    }
    if (ch == '\n') {
      lineBuffer[lineLen] = '\0';
      handleLine(lineBuffer);
      lineLen = 0;
    } else if (lineLen + 1 < LINE_LIMIT) {
      lineBuffer[lineLen++] = ch;
    } else {
      lineLen = 0;
      applyMotion(MOTION_STOP, 0);
      Serial.println("ERR line-too-long");
    }
  }

  if (millis() - lastCommandMs > COMMAND_TIMEOUT_MS) {
    applyMotion(MOTION_STOP, 0);
  }
}

void handleLine(char *line) {
  trimLeading(line);
  uppercase(line);

  if (strcmp(line, "PING") == 0) {
    Serial.println("PONG");
    return;
  }

  if (strcmp(line, "STOP") == 0) {
    applyMotion(MOTION_STOP, 0);
    lastCommandMs = millis();
    Serial.println("OK stop");
    return;
  }

  Motion motion = MOTION_STOP;
  int speed = 0;
  bool ok = parseMove(line, &motion, &speed);
  if (!ok) {
    applyMotion(MOTION_STOP, 0);
    Serial.println("ERR bad-command");
    return;
  }

  applyMotion(motion, clampSpeed(speed));
  lastCommandMs = millis();
  Serial.println("OK move");
}

bool parseMove(char *line, Motion *motion, int *speed) {
  char *verb = strtok(line, " ");
  char *dir = strtok(NULL, " ");
  char *value = strtok(NULL, " ");
  char *extra = strtok(NULL, " ");

  if (!verb || !dir || extra || strcmp(verb, "MOVE") != 0) {
    return false;
  }

  if (strcmp(dir, "FORWARD") == 0) {
    *motion = MOTION_FORWARD;
  } else if (strcmp(dir, "BACKWARD") == 0) {
    *motion = MOTION_BACKWARD;
  } else if (strcmp(dir, "LEFT") == 0) {
    *motion = MOTION_LEFT;
  } else if (strcmp(dir, "RIGHT") == 0) {
    *motion = MOTION_RIGHT;
  } else {
    return false;
  }

  *speed = value ? atoi(value) : 160;
  return true;
}

void applyMotion(Motion motion, int speed) {
  digitalWrite(PIN_STEER_LEFT, LOW);
  digitalWrite(PIN_STEER_RIGHT, LOW);

  switch (motion) {
    case MOTION_FORWARD:
      digitalWrite(PIN_MOTOR_IN1, HIGH);
      digitalWrite(PIN_MOTOR_IN2, LOW);
      analogWrite(PIN_MOTOR_PWM, speed);
      break;
    case MOTION_BACKWARD:
      digitalWrite(PIN_MOTOR_IN1, LOW);
      digitalWrite(PIN_MOTOR_IN2, HIGH);
      analogWrite(PIN_MOTOR_PWM, speed);
      break;
    case MOTION_LEFT:
      digitalWrite(PIN_STEER_LEFT, HIGH);
      digitalWrite(PIN_MOTOR_IN1, HIGH);
      digitalWrite(PIN_MOTOR_IN2, LOW);
      analogWrite(PIN_MOTOR_PWM, speed);
      break;
    case MOTION_RIGHT:
      digitalWrite(PIN_STEER_RIGHT, HIGH);
      digitalWrite(PIN_MOTOR_IN1, HIGH);
      digitalWrite(PIN_MOTOR_IN2, LOW);
      analogWrite(PIN_MOTOR_PWM, speed);
      break;
    case MOTION_STOP:
    default:
      digitalWrite(PIN_MOTOR_IN1, LOW);
      digitalWrite(PIN_MOTOR_IN2, LOW);
      analogWrite(PIN_MOTOR_PWM, 0);
      break;
  }
}

int clampSpeed(int speed) {
  if (speed < 0) {
    return 0;
  }
  if (speed > 255) {
    return 255;
  }
  return speed;
}

void uppercase(char *s) {
  for (; *s; ++s) {
    if (*s >= 'a' && *s <= 'z') {
      *s = (char)(*s - 'a' + 'A');
    }
  }
}

void trimLeading(char *s) {
  size_t i = 0;
  while (s[i] == ' ' || s[i] == '\t') {
    ++i;
  }
  if (i > 0) {
    memmove(s, s + i, strlen(s + i) + 1);
  }
}


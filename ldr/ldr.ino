#include <AccelStepper.h>
#include <Wire.h>
#include "RTClib.h"

// ==========================================================
// >>>>>> CONTROL SETTINGS - ADJUST PARAMETERS BELOW <<<<<<
// ==========================================================

// 1. NEMA 17 Stepper Settings
#define NEMA_SPEED        600   
#define NEMA_ACCEL        1200  
#define NEMA_HOME_SPEED   400   
#define NEMA_SAFE_DIST    400   

// 2. DC Motor Settings (Locking Mechanism)
#define DC_CLEAN_HOLD     180   // Holding power during cleaning
#define DC_CENTER_SPEED   90   // Homing/Centering speed (Reduced for safety)
#define DC_TRACK_SPEED    120   // Tracking adjustment speed
#define DC_IDLE_HOLD      35    // Idle holding torque
#define TRACK_THRESHOLD   45    // LDR difference threshold

// Time to return to center position (Calibrate as needed)
const unsigned long DC_CENTER_TIME = 2800; 

// ==========================================================
// DEFINITIONS & PINS
// ==========================================================

#define RPWM_DC 3  
#define LPWM_DC 6  
#define STEP_X 2
#define DIR_X  5   
#define EN_PIN 8
#define STEPPER_HOME 9  
#define STEPPER_END  10 
#define DC_LIMIT_L A3  
#define DC_LIMIT_R A2  
#define LDR_L A0
#define LDR_R A1

AccelStepper cleaner(AccelStepper::DRIVER, STEP_X, DIR_X);

// --- CLEANING TIMER VARIABLES ---
unsigned long lastCleanMillis = 0; 
// First cleaning cycle delay (60000ms = 1 minute)
const unsigned long cleanInterval = 60000; 

// --- SERIAL CONTROL VARIABLES ---
bool isManualMode = false;
bool isSystemActive = false; 
bool isEmergencyStop = false; 
unsigned long lastHeartbeatMillis = 0;
const unsigned long heartbeatTimeout = 4000; 

unsigned long lastTelemetryMillis = 0;
const unsigned long telemetryInterval = 200;

// --- FORWARD DECLARATIONS ---
void motorDCLock(int power);
void cleanInCenterPosition();
void solarTracking();
void processSerialCommands();
void reportTelemetry();
void doHoming();
void goToCenter();

void setup() {
  Serial.begin(9600);
  Serial.setTimeout(50); 
  Serial.println("{\"Log\":\"--- SYSTEM STARTED ---\"}");
  
  pinMode(EN_PIN, OUTPUT);
  digitalWrite(EN_PIN, LOW); 
  
  pinMode(STEPPER_HOME, INPUT_PULLUP);
  pinMode(STEPPER_END, INPUT_PULLUP);
  pinMode(RPWM_DC, OUTPUT);
  pinMode(LPWM_DC, OUTPUT);
  pinMode(DC_LIMIT_L, INPUT_PULLUP);
  pinMode(DC_LIMIT_R, INPUT_PULLUP);

  cleaner.setMaxSpeed(NEMA_SPEED);
  cleaner.setAcceleration(NEMA_ACCEL);

  doHoming();
}

void loop() {
  unsigned long currentMillis = millis();
  
  processSerialCommands();

  // Emergency Override
  if (isEmergencyStop) {
    motorDCLock(0);
    if (cleaner.isRunning()) cleaner.stop();
    if (currentMillis - lastTelemetryMillis >= telemetryInterval) {
      Serial.println("{\"Status\":\"EMERGENCY STOP\",\"Action\":\"STOPPED\",\"Emergency\":true}");
      lastTelemetryMillis = currentMillis;
    }
    return; 
  }

  if (currentMillis - lastTelemetryMillis >= telemetryInterval) {
    reportTelemetry();
    lastTelemetryMillis = currentMillis;
  }
  
  // Connection Safety Check
  if (currentMillis - lastHeartbeatMillis > heartbeatTimeout) {
    if (isSystemActive) {
       isSystemActive = false; 
       motorDCLock(0); 
       Serial.println("{\"Log\":\"SAFETY STOP: Connection Lost!\"}");
    }
  }

  // Main Logic
  if (isSystemActive) {
      if (!isManualMode) {
          if (currentMillis - lastCleanMillis >= cleanInterval) {
            Serial.println("{\"Log\":\"Timer: Starting Scheduled Cleaning\"}");
            cleanInCenterPosition(); 
            lastCleanMillis = millis();
          }
          solarTracking();
      }
      // FORCE LOCK: Ensure Stepper is always enabled (clutched)
      digitalWrite(EN_PIN, LOW); 
  } else {
     motorDCLock(0); 
     // Ensure Stepper locked even if system inactive?
     // No, maybe safety? User said 'clutch when stopped'.
     // So we lock it always.
     digitalWrite(EN_PIN, LOW);
  }
}

// --- LOGIC FUNCTIONS ---

void motorDCLock(int power) {
  analogWrite(RPWM_DC, power);
  analogWrite(LPWM_DC, power);
}

void processSerialCommands() {
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    
    // Emergency Commands
    if (input == "STOP") {
      isEmergencyStop = true;
      isSystemActive = false;
      Serial.println("{\"Log\":\"!!! EMERGENCY STOP TRIGGERED !!!\"}");
      return;
    }
    if (input == "RESUME") {
      isEmergencyStop = false;
      isSystemActive = true;
      lastHeartbeatMillis = millis(); 
      Serial.println("{\"Log\":\"System Resumed from Emergency\"}");
      return;
    }

    if (input == "HEARTBEAT") {
       lastHeartbeatMillis = millis();
       if (!isSystemActive && !isEmergencyStop) {
          isSystemActive = true;
          Serial.println("{\"Log\":\"Connection Active!\"}");
       }
       return;
    }

    if (!isSystemActive || isEmergencyStop) return; 

    if (input.startsWith("MODE:")) {
      String mode = input.substring(5);
      if (mode == "MANUAL") {
        isManualMode = true;
        motorDCLock(0); 
        Serial.println("{\"Log\":\"Manual Mode Activated\"}");
      } else if (mode == "AUTO") {
        isManualMode = false;
        Serial.println("{\"Log\":\"Auto Tracking Activated\"}");
      }
    }
    else if (isManualMode && input.startsWith("DC:")) {
      int speed = input.substring(3).toInt();
      if (speed == 0) {
         motorDCLock(0);
         Serial.println("{\"Log\":\"Motor: DC Stopped\"}");
      } else if (speed > 0) {
         if (digitalRead(DC_LIMIT_L) == HIGH) { 
            analogWrite(RPWM_DC, abs(speed));
            analogWrite(LPWM_DC, 0);
            Serial.println("{\"Log\":\"Motor: DC Moving Right\"}");
         } else {
            motorDCLock(0); 
            Serial.println("{\"Log\":\"Blocked: Left Limit Reached\"}");
         }
      } else {
         if (digitalRead(DC_LIMIT_R) == HIGH) { 
            analogWrite(RPWM_DC, 0);
            analogWrite(LPWM_DC, abs(speed));
            Serial.println("{\"Log\":\"Motor: DC Moving Left\"}");
         } else {
            motorDCLock(0); 
            Serial.println("{\"Log\":\"Blocked: Right Limit Reached\"}");
         }
      }
    }
    else if (isManualMode && input.startsWith("CLEAN:")) {
       Serial.println("{\"Log\":\"Manual Cleaning Requested\"}");
       cleanInCenterPosition();
    }
  }
}

void reportTelemetry() {
  int valL = analogRead(LDR_L);
  int valR = analogRead(LDR_R);
  int diff = valL - valR;
  String action = "IDLE";
  
  if (!isSystemActive) action = "DISCONNECTED";
  else if (isManualMode) action = "MANUAL";
  else if (abs(diff) > TRACK_THRESHOLD) action = "TRACKING";
  
  Serial.print("{");
  Serial.print("\"LDR_L\":"); Serial.print(valL); Serial.print(",");
  Serial.print("\"LDR_R\":"); Serial.print(valR); Serial.print(",");
  Serial.print("\"Manual\":"); Serial.print(isManualMode ? "true" : "false"); Serial.print(",");
  Serial.print("\"Active\":"); Serial.print(isSystemActive ? "true" : "false"); Serial.print(",");
  Serial.print("\"Emergency\":"); Serial.print(isEmergencyStop ? "true" : "false"); Serial.print(",");
  Serial.print("\"LimitL\":"); Serial.print(digitalRead(DC_LIMIT_L) == LOW ? 1 : 0); Serial.print(","); 
  Serial.print("\"LimitR\":"); Serial.print(digitalRead(DC_LIMIT_R) == LOW ? 1 : 0); Serial.print(","); 
  Serial.print("\"Diff\":"); Serial.print(diff); Serial.print(",");
  Serial.print("\"Action\":\""); Serial.print(action); Serial.print("\"");
  Serial.println("}");
}

void goToCenter() {
  Serial.println("{\"Log\":\"Action: Gentle seek to limit...\"}");
  unsigned long moveStartTime = millis();
  
  // Gentle Search Loop
  while (digitalRead(DC_LIMIT_R) == HIGH && digitalRead(DC_LIMIT_L) == HIGH) {
    processSerialCommands(); 
    if (isEmergencyStop) {
      motorDCLock(0);
      return; 
    }

    analogWrite(RPWM_DC, 0);
    analogWrite(LPWM_DC, DC_CENTER_SPEED);
    
    if(millis() - moveStartTime > 15000) break; 
  }
  
  motorDCLock(0); 
  delay(1000);   

  Serial.println("{\"Log\":\"Action: Moving to Center...\"}");
  
  unsigned long centerStartTime = millis();
  while (millis() - centerStartTime < DC_CENTER_TIME) {
     processSerialCommands(); 
     if (isEmergencyStop) {
       motorDCLock(0);
       return; 
     }
     analogWrite(RPWM_DC, DC_CENTER_SPEED);
     analogWrite(LPWM_DC, 0);
  }

  motorDCLock(DC_CLEAN_HOLD);
  Serial.println("{\"Log\":\"Action: CENTER LOCKED.\"}");
}

void cleanInCenterPosition() {
  Serial.println("{\"Status\":\"Cleaning\",\"Action\":\"CLEANING\"}");
  
  goToCenter(); 
  if (isEmergencyStop) return;

  delay(1000); 

  Serial.println("{\"Log\":\">>> BRUSH MOVEMENT STARTED <<<\"}");
  for (int i = 0; i < 3; i++) {
    if (isEmergencyStop) return;

    // Sweep Right
    cleaner.moveTo(30000); 
    while (digitalRead(STEPPER_END) == HIGH) {
      processSerialCommands();
      if (isEmergencyStop) { cleaner.stop(); return; }
      
      motorDCLock(DC_CLEAN_HOLD); 
      cleaner.run();
      
      if (cleaner.distanceToGo() == 0) break;
    }
    cleaner.stop();
    while(cleaner.isRunning()) { 
      processSerialCommands();
      if (isEmergencyStop) return;
      cleaner.run(); 
    }
    delay(400);

    // Sweep Left
    cleaner.moveTo(-30000);
    while (digitalRead(STEPPER_HOME) == HIGH) {
      processSerialCommands();
      if (isEmergencyStop) { cleaner.stop(); return; }

      motorDCLock(DC_CLEAN_HOLD); 
      cleaner.run();

      if (cleaner.distanceToGo() == 0) break;
    }
    cleaner.stop();
    while(cleaner.isRunning()) { 
      processSerialCommands();
      if (isEmergencyStop) return;
      cleaner.run(); 
    }
    delay(400);
  }

  Serial.println("{\"Log\":\"Returning to Safety Position...\"}");
  cleaner.moveTo(cleaner.currentPosition() + NEMA_SAFE_DIST);
  while (cleaner.distanceToGo() != 0) { 
     processSerialCommands();
     if (isEmergencyStop) { cleaner.stop(); return; }
     cleaner.run(); 
  }
  
  motorDCLock(DC_IDLE_HOLD); 
  Serial.println("{\"Log\":\">>> CLEANING CYCLE COMPLETE <<<\"}");
}

void solarTracking() {
  int valL = analogRead(LDR_L);
  int valR = analogRead(LDR_R);
  int diff = valL - valR;

  if (abs(diff) > TRACK_THRESHOLD) {
    if (diff > 0 && digitalRead(DC_LIMIT_L) == HIGH) {
      analogWrite(RPWM_DC, DC_TRACK_SPEED);
      analogWrite(LPWM_DC, 0);
    } 
    else if (diff < 0 && digitalRead(DC_LIMIT_R) == HIGH) {
      analogWrite(RPWM_DC, 0);
      analogWrite(LPWM_DC, DC_TRACK_SPEED);
    }
  } else {
    motorDCLock(DC_IDLE_HOLD); 
  }
}

void doHoming() {
  Serial.println("{\"Log\":\"Homing Stepper...\"}");
  cleaner.setMaxSpeed(NEMA_HOME_SPEED);
  while (digitalRead(STEPPER_HOME) == HIGH) {
    cleaner.setSpeed(-NEMA_HOME_SPEED);
    cleaner.runSpeed();
  }
  cleaner.setCurrentPosition(0);
  cleaner.moveTo(NEMA_SAFE_DIST);
  while (cleaner.distanceToGo() != 0) { cleaner.run(); }
  cleaner.setMaxSpeed(NEMA_SPEED);
}

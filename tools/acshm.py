"""Lectura de la memoria compartida de Assetto Corsa (acpmf_physics, acpmf_graphics, acpmf_static).

Estructuras según la documentación de Kunos (las mismas que usa sim_info.py), cortadas en los campos
que hacen falta. Solo funciona en Windows y con el juego abierto.
"""
import ctypes
import mmap
from ctypes import c_float, c_int, c_wchar


class Physics(ctypes.Structure):
    _pack_ = 4
    _fields_ = [
        ('packetId', c_int), ('gas', c_float), ('brake', c_float), ('fuel', c_float),
        ('gear', c_int), ('rpms', c_int), ('steerAngle', c_float), ('speedKmh', c_float),
        ('velocity', c_float * 3), ('accG', c_float * 3),
        ('wheelSlip', c_float * 4), ('wheelLoad', c_float * 4), ('wheelsPressure', c_float * 4),
        ('wheelAngularSpeed', c_float * 4), ('tyreWear', c_float * 4), ('tyreDirtyLevel', c_float * 4),
        ('tyreCoreTemperature', c_float * 4), ('camberRAD', c_float * 4), ('suspensionTravel', c_float * 4),
        ('drs', c_float), ('tc', c_float), ('heading', c_float), ('pitch', c_float), ('roll', c_float),
        ('cgHeight', c_float), ('carDamage', c_float * 5), ('numberOfTyresOut', c_int),
        ('pitLimiterOn', c_int), ('abs', c_float),
    ]


class Graphics(ctypes.Structure):
    _pack_ = 4
    _fields_ = [
        ('packetId', c_int), ('status', c_int), ('session', c_int),
        ('currentTime', c_wchar * 15), ('lastTime', c_wchar * 15), ('bestTime', c_wchar * 15), ('split', c_wchar * 15),
        ('completedLaps', c_int), ('position', c_int), ('iCurrentTime', c_int), ('iLastTime', c_int), ('iBestTime', c_int),
        ('sessionTimeLeft', c_float), ('distanceTraveled', c_float), ('isInPit', c_int), ('currentSectorIndex', c_int),
        ('lastSectorTime', c_int), ('numberOfLaps', c_int), ('tyreCompound', c_wchar * 33),
        ('replayTimeMultiplier', c_float), ('normalizedCarPosition', c_float), ('carCoordinates', c_float * 3),
        ('penaltyTime', c_float), ('flag', c_int), ('idealLineOn', c_int), ('isInPitLane', c_int),
    ]


class Static(ctypes.Structure):
    _pack_ = 4
    _fields_ = [
        ('smVersion', c_wchar * 15), ('acVersion', c_wchar * 15), ('numberOfSessions', c_int), ('numCars', c_int),
        ('carModel', c_wchar * 33), ('track', c_wchar * 33), ('playerName', c_wchar * 33),
        ('playerSurname', c_wchar * 33), ('playerNick', c_wchar * 33), ('sectorCount', c_int),
        ('maxTorque', c_float), ('maxPower', c_float), ('maxRpm', c_int), ('maxFuel', c_float),
        ('suspensionMaxTravel', c_float * 4), ('tyreRadius', c_float * 4), ('maxTurboBoost', c_float),
        ('deprecated_1', c_float), ('deprecated_2', c_float), ('penaltiesEnabled', c_int),
        ('aidFuelRate', c_float), ('aidTireRate', c_float), ('aidMechanicalDamage', c_float),
        ('aidAllowTyreBlankets', c_int), ('aidStability', c_float), ('aidAutoClutch', c_int), ('aidAutoBlip', c_int),
        ('hasDRS', c_int), ('hasERS', c_int), ('hasKERS', c_int), ('kersMaxJ', c_float),
        ('engineBrakeSettingsCount', c_int), ('ersPowerControllerCount', c_int), ('trackSPlineLength', c_float),
        ('trackConfiguration', c_wchar * 33),
    ]


STATUS = {0: 'apagado', 1: 'repetición', 2: 'en pista', 3: 'pausa'}


class SharedMemory:
    def __init__(self):
        self._maps = {
            'physics': mmap.mmap(-1, ctypes.sizeof(Physics), 'Local\\acpmf_physics', access=mmap.ACCESS_READ),
            'graphics': mmap.mmap(-1, ctypes.sizeof(Graphics), 'Local\\acpmf_graphics', access=mmap.ACCESS_READ),
            'static': mmap.mmap(-1, ctypes.sizeof(Static), 'Local\\acpmf_static', access=mmap.ACCESS_READ),
        }

    def _read(self, name, cls):
        m = self._maps[name]
        m.seek(0)
        return cls.from_buffer_copy(m.read(ctypes.sizeof(cls)))

    def physics(self):
        return self._read('physics', Physics)

    def graphics(self):
        return self._read('graphics', Graphics)

    def static(self):
        return self._read('static', Static)

    def close(self):
        for m in self._maps.values():
            m.close()

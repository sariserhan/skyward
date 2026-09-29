class_name AirportSound
extends Node
## Local synthesized ambience and touchdown rumble; no remote sound service.
var enabled := false
var ambience: AudioStreamPlayer
var touchdown: AudioStreamPlayer
var rainy := false
func _ready() -> void:
	ambience=AudioStreamPlayer.new(); ambience.stream=_noise(2.0,true); ambience.volume_db=-34; add_child(ambience)
	touchdown=AudioStreamPlayer.new(); touchdown.stream=_noise(.35,false); touchdown.volume_db=-22; add_child(touchdown)
func _noise(seconds: float,loop: bool) -> AudioStreamWAV:
	var stream:=AudioStreamWAV.new(); stream.format=AudioStreamWAV.FORMAT_16_BITS; stream.mix_rate=22050
	var samples:=int(seconds*22050); var data:=PackedByteArray(); data.resize(samples*2)
	var rng:=RandomNumberGenerator.new(); rng.seed=417
	var last:=0.0
	for i in samples:
		last=lerpf(last,rng.randf_range(-1,1),.12)
		var envelope:=1.0 if loop else pow(1.0-float(i)/samples,2)
		data.encode_s16(i*2,int(last*envelope*26000))
	stream.data=data
	if loop: stream.loop_mode=AudioStreamWAV.LOOP_FORWARD; stream.loop_end=samples
	return stream
func set_enabled(value: bool) -> void:
	enabled=value
	if value: ambience.play()
	else: ambience.stop(); touchdown.stop()
func update_weather(wet: bool) -> void:
	rainy=wet
	if ambience!=null: ambience.volume_db=-25 if wet else -34; ambience.pitch_scale=1.8 if wet else .7
func touch_down() -> void:
	if enabled: touchdown.play()

func _exit_tree() -> void:
	ambience.stop(); touchdown.stop()
	ambience.stream=null; touchdown.stream=null

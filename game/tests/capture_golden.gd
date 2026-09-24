extends SceneTree
## Writes the standalone boarding regression baseline. See StandaloneGolden.

func _initialize() -> void:
	var file := FileAccess.open(StandaloneGolden.PATH, FileAccess.WRITE)
	file.store_string(JSON.stringify(StandaloneGolden.compute(), "\t", true))
	file.close()
	print("wrote %s" % StandaloneGolden.PATH)
	quit()

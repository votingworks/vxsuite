install-script-dependencies:
	wget 'https://github.com/martinpaljak/GlobalPlatformPro/releases/download/v20.08.12/gp.jar'
	@echo 'Checking hash of downloaded gp.jar'
	@sha256sum gp.jar | diff scripts/gp.jar.sha256sum - || (echo '❌ Hash check of downloaded gp.jar failed' && rm gp.jar && exit 1)
	mv gp.jar scripts/gp.jar

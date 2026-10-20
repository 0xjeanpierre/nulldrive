push:
	read MSG
	git add . && git commit -m $MSG && git push
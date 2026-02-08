# Where should we write the GIF?
Output demo.gif

# Set up a 1200x600 terminal with 46px font.
Set FontSize 24
Set Width 1200
Set Height 600

# Basic mode
Type "hm what is running on port 3000"
Sleep 500ms
Enter
Sleep 5s

# Dry-run mode — copy to clipboard
Type "hm . curl POST json to localhost:3000/api/users with name and email"
Sleep 500ms
Enter
Sleep 5s

# Danger detection
Type "hm kill the process on port 3000"
Sleep 500ms
Enter
Sleep 5s
Type "Y"
Sleep 300ms
Enter
Type "Y"
Sleep 300ms
Enter
Sleep 2s

# Doctor mode — grep glob expansion error
#Type `grep -r "TODO" --include *.ts`
#Sleep 500ms
#Enter
#Sleep 2s
#Type "hm"
#Sleep 500ms
#Enter
#Sleep 5s

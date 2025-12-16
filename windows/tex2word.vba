Option Explicit ' Force declaration of all variables to avoid syntax errors

Sub ConvertTeXToOMath_Fixed()
    Dim doc As Document
    Dim rng As Range
    Dim mathRange As Range
    Dim om As OMath
    Dim tempRange As Range
    Dim cleanText As String ' Unified declaration of cleaned formula text
    Dim findSuccess As Boolean ' Flag for search success

    ' Disable screen refreshing to improve running speed
    Application.ScreenUpdating = False

    On Error GoTo ErrorHandler ' Error trapping

    Set doc = ActiveDocument
    If doc Is Nothing Then
        MsgBox "No active document found!", vbExclamation, "Error"
        Exit Sub
    End If

    ' ========== Step 1: Convert display equations $$...$$ ==========
    Set rng = doc.Content
    With rng.Find
        .ClearFormatting ' Clear search formatting
        .Text = "\$\$[!\$]@\$\$" ' Wildcard match content wrapped in $$ (excluding empty $$)
        .MatchWildcards = True ' Enable wildcards
        .Forward = True ' Search forward
        .Wrap = wdFindStop ' Stop at end of document
        .MatchCase = False ' Case-insensitive
        .MatchWholeWord = False ' Do not match whole words

        Do While .Execute
            Set mathRange = rng.Duplicate ' Copy found range to avoid modifying original range

            ' Remove leading and trailing $$ symbols
            mathRange.Start = mathRange.Start + 2
            mathRange.End = mathRange.End - 2
            cleanText = Trim(mathRange.Text) ' Remove leading/trailing spaces

            If Len(cleanText) > 0 Then ' Only process non-empty formulas
                rng.Delete ' Delete original $$...$$ content
                rng.Text = cleanText ' Insert cleaned formula text

                ' Convert text to OMath display equation (block-level)
                Set tempRange = rng.OMaths.Add(rng)
                Set om = tempRange.OMaths(1)
                om.Type = wdOMathDisplay ' Set as display type (centered)
                om.BuildUp ' Build formula formatting
            End If

            ' Reset search range to avoid infinite loop
            rng.Start = IIf(tempRange Is Nothing, rng.End, tempRange.End)
            rng.Collapse Direction:=wdCollapseEnd
            Set tempRange = Nothing ' Release variable
        Loop
    End With

    ' ========== Step 2: Convert inline equations $...$ ==========
    Set rng = doc.Content ' Reset search range to entire document
    With rng.Find
        .ClearFormatting
        .Text = "\$[!\$]@\$" ' Wildcard match content wrapped in $ (excluding empty $)
        .MatchWildcards = True
        .Forward = True
        .Wrap = wdFindStop
        .MatchCase = False
        .MatchWholeWord = False

        Do While .Execute
            Set mathRange = rng.Duplicate

            ' Remove leading and trailing $ symbols
            mathRange.Start = mathRange.Start + 1
            mathRange.End = mathRange.End - 1
            cleanText = Trim(mathRange.Text)

            If Len(cleanText) > 0 Then
                rng.Delete
                rng.Text = cleanText

                ' Convert text to OMath inline equation
                Set tempRange = rng.OMaths.Add(rng)
                Set om = tempRange.OMaths(1)
                om.Type = wdOMathInline ' Set as inline type (embedded in text)
                om.BuildUp
            End If

            rng.Start = IIf(tempRange Is Nothing, rng.End, tempRange.End)
            rng.Collapse Direction:=wdCollapseEnd
            Set tempRange = Nothing
        Loop
    End With

    ' Restore screen refreshing and show completion prompt
    Application.ScreenUpdating = True
    MsgBox "TeX equations have been batch converted to native Word equations!" & vbCrLf & _
           "Display equations ($$...$$) → Display-type equations" & vbCrLf & _
           "Inline equations ($...$) → Inline-type equations", vbInformation, "Conversion Complete"

    Exit Sub ' Normal exit (skip error handler)

ErrorHandler:
    ' Restore screen refreshing and show error message if an error occurs
    Application.ScreenUpdating = True
    MsgBox "An error occurred during conversion: " & Err.Description & vbCrLf & _
           "Error code: " & Err.Number, vbCritical, "Error"
End Sub

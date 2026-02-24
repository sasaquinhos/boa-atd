function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const doc = SpreadsheetApp.getActiveSpreadsheet();
    const jsonString = e.postData.contents;
    const data = JSON.parse(jsonString);
    const action = data.action; // 'update_attendance', 'add_member', etc.

    let result = {};

    if (action === 'update_attendance') {
      result = handleUpdateAttendance(doc, data);
    } else if (action === 'add_member') {
      result = handleAddMember(doc, data);
    } else if (action === 'update_member') {
      result = handleUpdateMember(doc, data);
    } else if (action === 'delete_member') {
      result = handleDeleteMember(doc, data);
    } else if (action === 'add_match') {
      result = handleAddMatch(doc, data);
    } else if (action === 'update_match') {
      result = handleUpdateMatch(doc, data);
    } else if (action === 'delete_match') {
      result = handleDeleteMatch(doc, data);
    } else if (action === 'update_setting') {
      result = handleUpdateSetting(doc, data);
    } else if (action === 'verify_admin') {
      result = verifyAdminPassword(data.password);
    } else if (action === 'update_admin_password') {
      result = updateAdminPassword(data.oldPassword, data.newPassword);
    } else if (action === 'setup_janken_trigger') {
      result = setupMasterTrigger();
    } else {
      // Fallback for legacy calls or default to attendance if action missing (backward compat if needed)
      // For now, assume action is required or default to update_attendance if fields match
      if (data.matchId && data.memberName) {
        result = handleUpdateAttendance(doc, data);
      } else {
         throw new Error('Unknown action: ' + action);
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({ result: 'success', data: result })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ result: 'error', error: err.toString() })).setMimeType(ContentService.MimeType.JSON);

  } finally {
    lock.releaseLock();
  }
}

/**
 * Automatically selects a Janken participant for home matches occurring in 2 days.
 * Triggered by GAS time-based trigger.
 */
function autoSelectJankenForUpcomingMatch() {
  const doc = SpreadsheetApp.getActiveSpreadsheet();
  const matchSheet = doc.getSheetByName('Matches');
  const attSheet = doc.getSheetByName('Attendance');
  const settingsSheet = doc.getSheetByName('Settings');
  
  if (!matchSheet || !attSheet || !settingsSheet) return;

  // Calculate target date (2 days from now in JST)
  const jstTargetStr = Utilities.formatDate(new Date(new Date().getTime() + 2 * 24 * 60 * 60 * 1000), "Asia/Tokyo", "yyyy-MM-dd");
  const targetDateStr = jstTargetStr;

  const mRows = matchSheet.getDataRange().getValues();
  
  // 1. Get leagues from settings
  let leagues = [];
  const sRows = settingsSheet.getDataRange().getValues();
  for (let j = 1; j < sRows.length; j++) {
    if (sRows[j][0] === 'leagues') {
      try {
        leagues = JSON.parse(sRows[j][1]);
      } catch(e) {
        console.error("Failed to parse leagues:", e);
      }
      break;
    }
  }

  // Find home matches on targetDate
  for (let i = 1; i < mRows.length; i++) {
    const rawDate = mRows[i][1];
    if (!rawDate) continue;
    
    const mDate = new Date(rawDate);
    const mDateStr = Utilities.formatDate(mDate, "Asia/Tokyo", "yyyy-MM-dd");
    
    const isHome = mRows[i][4] !== 'away';
    const isTargetDate = mDateStr === targetDateStr;
    const alreadyConfirmed = mRows[i][3] && String(mRows[i][3]).trim() !== '';

    if (isHome && isTargetDate && !alreadyConfirmed) {
      const matchId = mRows[i][0];

      // 2. Identify league
      const league = leagues.find(l => {
        const start = parseGASDate(l.start);
        let end = parseGASDate(l.end);
        // Handle YYYY-MM
        if (l.end && String(l.end).match(/^\d{4}[-/]\d{1,2}$/)) {
          end = new Date(end.getFullYear(), end.getMonth() + 1, 0, 23, 59, 59, 999);
        } else {
          end.setHours(23, 59, 59, 999);
        }
        return mDate >= start && mDate <= end;
      });

      if (!league) {
        console.error(`League not found for match on ${rawDate}`);
        continue;
      }

      // 3. Count wins in this league
      const winCounts = {};
      const leagueStart = parseGASDate(league.start);
      let leagueEnd = parseGASDate(league.end);
      if (league.end && String(league.end).match(/^\d{4}[-/]\d{1,2}$/)) {
        leagueEnd = new Date(leagueEnd.getFullYear(), leagueEnd.getMonth() + 1, 0, 23, 59, 59, 999);
      } else {
        leagueEnd.setHours(23, 59, 59, 999);
      }

      for (let k = 1; k < mRows.length; k++) {
        const checkDate = new Date(mRows[k][1]);
        if (checkDate >= leagueStart && checkDate <= leagueEnd) {
          if (mRows[k][3]) {
            const winners = String(mRows[k][3]).split(',').map(s => s.trim()).filter(s => s);
            winners.forEach(w => {
              winCounts[w] = (winCounts[w] || 0) + 1;
            });
          }
        }
      }

      // 4. Get candidates for this match from Attendance sheet
      const attRows = attSheet.getDataRange().getValues();
      const candidates = [];
      for (let k = 1; k < attRows.length; k++) {
        if (String(attRows[k][0]) === String(matchId) && (attRows[k][7] === true || attRows[k][7] === 'true')) {
          candidates.push(attRows[k][1]); // MemberName
        }
      }

      if (candidates.length === 0) {
        console.log(`No candidates for match ID ${matchId}`);
        continue;
      }

      // 5. Pick winner
      let minWins = Infinity;
      let selected = [];
      candidates.forEach(name => {
        const count = winCounts[name] || 0;
        if (count < minWins) {
          minWins = count;
          selected = [name];
        } else if (count === minWins) {
          selected.push(name);
        }
      });

      const finalWinner = selected[Math.floor(Math.random() * selected.length)];
      
      // Update Matches sheet
      matchSheet.getRange(i + 1, 4).setValue(finalWinner);
      console.log(`Auto-selected ${finalWinner} for match ID ${matchId} on ${rawDate}`);
    }
  }
}

function parseGASDate(str) {
  if (!str) return new Date();
  // Ensure YYYY-MM-DD format works with new Date()
  const d = new Date(str.toString().replace(/-/g, '/'));
  if (isNaN(d.getTime())) {
     // Handle YYYY-MM
     const parts = str.toString().split(/[-/]/);
     if (parts.length === 2) return new Date(parts[0], parseInt(parts[1]) - 1, 1);
  }
  return d;
}

/**
 * Master Scheduler: Runs daily (e.g., 19:00-20:00) to set a precise 20:00:00 trigger.
 */
function scheduleDailyJanken() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'autoSelectJankenForUpcomingMatch') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }

    // Capture "Today" in JST using robust ISO 8601 format
    var now = new Date();
    var isoStr = Utilities.formatDate(now, "Asia/Tokyo", "yyyy-MM-dd'T'20:00:00+09:00");
    var todayAt20 = new Date(isoStr);
    
    // Safety check: only create if in the future
    if (todayAt20.getTime() > now.getTime()) {
      ScriptApp.newTrigger('autoSelectJankenForUpcomingMatch')
        .timeBased()
        .at(todayAt20)
        .create();
      console.log("Scheduled for JST 20:00: " + isoStr);
    } else {
      console.log("Already past 20:00 JST today.");
    }
  } catch (e) {
    console.error("Error: " + e.toString());
  }
}

/**
 * Sets up the Master Trigger.
 * RUN THIS ONCE MANUALLY.
 */
function setupMasterTrigger() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      var fn = triggers[i].getHandlerFunction();
      if (fn === 'scheduleDailyJanken' || fn === 'autoSelectJankenForUpcomingMatch') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    
    // Master trigger: checks at 19:00 daily
    ScriptApp.newTrigger('scheduleDailyJanken')
      .timeBased()
      .everyDays(1)
      .atHour(19)
      .create();
      
    // Immediate run for today
    scheduleDailyJanken();

    return "Setup successful. Master trigger created.";
  } catch (e) {
    console.error("Setup Error: " + e.toString());
    throw e;
  }
}

/**
 * Simple test to verify the script can execute.
 */
function testScript() {
  console.log("Script is working. Timezone: " + Session.getScriptTimeZone());
}

function handleUpdateAttendance(doc, data) {
  let sheet = doc.getSheetByName('Attendance');
  if (!sheet) {
    sheet = doc.insertSheet('Attendance');
    sheet.appendRow(['MatchID', 'MemberName', 'Status', 'GuestsMain', 'GuestsBack', 'LastUpdated', 'BigFlag', 'JankenParticipate', 'MorningWithdraw']);
  }

  const timestamp = new Date();
  const rows = sheet.getDataRange().getValues();
  let rowIndex = -1;

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) == String(data.matchId) && String(rows[i][1]) == String(data.memberName)) {
      rowIndex = i + 1;
      break;
    }
  }

  // Ensure boolean/string values are handled safely
  const status = data.status || '';
  const gMain = data.guestsMain || '';
  const gBack = data.guestsBack || '';
  const bFlag = data.bigFlag === true || data.bigFlag === 'true';
  const jParticipate = data.jankenParticipate === true || data.jankenParticipate === 'true';
  const mWithdraw = data.morningWithdraw === true || data.morningWithdraw === 'true';

  if (rowIndex > 0) {
    // Update existing row
    sheet.getRange(rowIndex, 3).setValue(status);
    sheet.getRange(rowIndex, 4).setValue(gMain);
    sheet.getRange(rowIndex, 5).setValue(gBack);
    sheet.getRange(rowIndex, 6).setValue(timestamp);
    sheet.getRange(rowIndex, 7).setValue(bFlag);
    sheet.getRange(rowIndex, 8).setValue(jParticipate);
    sheet.getRange(rowIndex, 9).setValue(mWithdraw);
  } else {
    // Append new row
    sheet.appendRow([
      data.matchId,
      data.memberName,
      status,
      gMain,
      gBack,
      timestamp,
      bFlag,
      jParticipate,
      mWithdraw
    ]);
  }
  return { updated: true };
}

function handleAddMember(doc, data) {
  let sheet = doc.getSheetByName('Members');
  if (!sheet) {
      sheet = doc.insertSheet('Members');
      sheet.appendRow(['Name', 'Section']);
  }
  sheet.appendRow([data.name, data.section]);
  return { added: true };
}

function handleUpdateMember(doc, data) {
  let sheet = doc.getSheetByName('Members');
  if (!sheet) return;
  const rows = sheet.getDataRange().getValues();
  // Name is key
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == data.originalName) {
       sheet.getRange(i + 1, 1).setValue(data.name);
       sheet.getRange(i + 1, 2).setValue(data.section);
       
       // Also update attendance records if name changed
       if (data.originalName !== data.name) {
         updateAttendanceMemberName(doc, data.originalName, data.name);
       }
       break;
    }
  }
  return { updated: true };
}

function updateAttendanceMemberName(doc, oldName, newName) {
    let sheet = doc.getSheetByName('Attendance');
    if (!sheet) return;
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][1] == oldName) {
        sheet.getRange(i + 1, 2).setValue(newName);
      }
    }
}

function handleDeleteMember(doc, data) {
  let sheet = doc.getSheetByName('Members');
  if (!sheet) return;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == data.name) {
      sheet.deleteRow(i + 1);
      // Optional: Delete attendance?
      break;
    }
  }
  // Delete attendance
  let attSheet = doc.getSheetByName('Attendance');
  if (attSheet) {
      const attRows = attSheet.getDataRange().getValues();
      // Loop backwards to delete safely
      for (let i = attRows.length - 1; i >= 1; i--) {
          if (attRows[i][1] == data.name) {
              attSheet.deleteRow(i + 1);
          }
      }
  }
  return { deleted: true };
}

function handleAddMatch(doc, data) {
  let sheet = doc.getSheetByName('Matches');
  if (!sheet) {
      sheet = doc.insertSheet('Matches');
      sheet.appendRow(['ID', 'Date', 'Opponent', 'JankenConfirmed', 'Location', 'SeatType', 'Deadline', 'QueueFlag', 'QueueTime', 'LineOrgFlag', 'LineOrgTime', 'AwayNotice']);
  }
  sheet.appendRow([
      data.id, 
      data.date, 
      data.opponent, 
      '', 
      data.location || 'home', 
      data.seatType || '',
      data.deadline || '',
      data.queueFlag || false,
      data.queueTime || '',
      data.lineOrgFlag || false,
      data.lineOrgTime || '',
      data.awayNotice || ''
  ]);
  return { added: true };
}

function handleUpdateMatch(doc, data) {
    let sheet = doc.getSheetByName('Matches');
    if (!sheet) return;
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) == String(data.id)) {
        if (data.date !== undefined) sheet.getRange(i + 1, 2).setValue(data.date);
        if (data.opponent !== undefined) sheet.getRange(i + 1, 3).setValue(data.opponent);
        if (data.jankenConfirmed !== undefined) sheet.getRange(i + 1, 4).setValue(data.jankenConfirmed);
        if (data.location !== undefined) sheet.getRange(i + 1, 5).setValue(data.location);
        if (data.seatType !== undefined) sheet.getRange(i + 1, 6).setValue(data.seatType);
        if (data.deadline !== undefined) sheet.getRange(i + 1, 7).setValue(data.deadline);
        if (data.queueFlag !== undefined) sheet.getRange(i + 1, 8).setValue(data.queueFlag);
        if (data.queueTime !== undefined) sheet.getRange(i + 1, 9).setValue(data.queueTime);
        if (data.lineOrgFlag !== undefined) sheet.getRange(i + 1, 10).setValue(data.lineOrgFlag);
        if (data.lineOrgTime !== undefined) sheet.getRange(i + 1, 11).setValue(data.lineOrgTime);
        if (data.awayNotice !== undefined) sheet.getRange(i + 1, 12).setValue(data.awayNotice);
        break;
      }
    }
    return { updated: true };
}

function handleDeleteMatch(doc, data) {
    let sheet = doc.getSheetByName('Matches');
    if (!sheet) return;
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) == String(data.id)) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
    // Delete attendance for this match
    let attSheet = doc.getSheetByName('Attendance');
    if (attSheet) {
      const attRows = attSheet.getDataRange().getValues();
        for (let i = attRows.length - 1; i >= 1; i--) {
            if (String(attRows[i][0]) == String(data.id)) {
                attSheet.deleteRow(i + 1);
            }
        }
    }
    return { deleted: true };
}

function handleUpdateSetting(doc, data) {
  let sheet = doc.getSheetByName('Settings');
  if (!sheet) {
    sheet = doc.insertSheet('Settings');
    sheet.appendRow(['Key', 'Value']);
  }
  
  const rows = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == data.key) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 2).setValue(data.value);
  } else {
    sheet.appendRow([data.key, data.value]);
  }
  return { updated: true };
}

/**
 * Verifies the admin password.
 */
function verifyAdminPassword(inputPassword) {
  const props = PropertiesService.getScriptProperties();
  let correctPassword = props.getProperty('ADMIN_PASSWORD');
  
  // Default password if not set
  if (!correctPassword) {
    correctPassword = 'boa';
    props.setProperty('ADMIN_PASSWORD', correctPassword);
  }
  
  return { success: inputPassword === correctPassword };
}

/**
 * Updates the admin password.
 */
function updateAdminPassword(oldPassword, newPassword) {
  const verification = verifyAdminPassword(oldPassword);
  if (!verification.success) {
    throw new Error('現在のパスワードが正しくありません。');
  }
  
  if (!newPassword || newPassword.length < 3) {
    throw new Error('新しいパスワードは3文字以上で入力してください。');
  }
  
  PropertiesService.getScriptProperties().setProperty('ADMIN_PASSWORD', newPassword);
  return { updated: true };
}

function doGet(e) {
  const doc = SpreadsheetApp.getActiveSpreadsheet();
  const yearParam = e && e.parameter ? e.parameter.year : null;
  
  // 1. Get Attendance
  let sheet = doc.getSheetByName('Attendance');
  let attendanceData = {};
  if (sheet) {
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0];
    // Simple index mapping for robustness
    const colMatchId = 0;
    const colMemberName = 1;
    const colStatus = 2;
    const colGMain = 3;
    const colGBack = 4;
    const colBFlag = 6;
    const colJPart = 7;
    const colMWit = 8;

    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[colMatchId] || !r[colMemberName]) continue;
        const key = `${r[colMatchId]}_${r[colMemberName]}`;
        attendanceData[key] = {
            status: r[colStatus],
            guestsMain: r[colGMain],
            guestsBack: r[colGBack],
            bigFlag: r[colBFlag] === true || r[colBFlag] === 'true',
            jankenParticipate: r[colJPart] === true || r[colJPart] === 'true',
            morningWithdraw: r[colMWit] === true || r[colMWit] === 'true'
        };
    }
  }

  // 2. Get Matches (If we want to sync matches via Sheet too)
  // For now, let's allow managing matches via Sheet or just store them separately.
  // Ideally, matches should also be on a sheet so they are shared.
  let matchesData = [];
  const matchSheet = doc.getSheetByName('Matches');
  if (matchSheet) {
    const mRows = matchSheet.getDataRange().getValues();
    // Headers: ID, Date, Opponent
    for (let i = 1; i < mRows.length; i++) {
        const matchDate = new Date(mRows[i][1]);
        const matchYear = String(matchDate.getFullYear());
        
        if (!yearParam || matchYear === String(yearParam)) {
            matchesData.push({
                id: mRows[i][0],
                date: mRows[i][1],
                opponent: mRows[i][2],
                jankenConfirmed: mRows[i][3], // Col 4
                location: mRows[i][4] || 'home', // Col 5
                seatType: mRows[i][5] || '', // Col 6
                deadline: mRows[i][6] || '', // Col 7
                queueFlag: mRows[i][7] === true || mRows[i][7] === 'true', // Col 8
                queueTime: mRows[i][8] || '', // Col 9
                lineOrgFlag: mRows[i][9] === true || mRows[i][9] === 'true', // Col 10
                lineOrgTime: mRows[i][10] || '', // Col 11
                awayNotice: mRows[i][11] || '' // Col 12
            });
        }
    }
  }
  
  // 3. Get Members (Sync members)
  let membersData = [];
  const memSheet = doc.getSheetByName('Members');
  if (memSheet) {
    const memRows = memSheet.getDataRange().getValues();
    // Headers: Name, Section
    for (let i = 1; i < memRows.length; i++) {
      membersData.push({
        name: memRows[i][0],
        section: memRows[i][1]
      });
    }
  }

  // 4. Get Settings
  let settingsData = {};
  const settingsSheet = doc.getSheetByName('Settings');
  if (settingsSheet) {
    const sRows = settingsSheet.getDataRange().getValues();
    for (let i = 1; i < sRows.length; i++) {
      settingsData[sRows[i][0]] = sRows[i][1];
    }
  }

  const result = {
    attendance: attendanceData,
    matches: matchesData,
    members: membersData,
    settings: settingsData
  };

  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Returns match data for a specific year.
 * @param {number|string} year - The year to filter by.
 * @returns {Array<Object>} Array of match objects.
 */
function getMatchesByYear(year) {
  const doc = SpreadsheetApp.getActiveSpreadsheet();
  const matchSheet = doc.getSheetByName('Matches');
  const matchesData = [];
  
  if (!matchSheet) return matchesData;

  const mRows = matchSheet.getDataRange().getValues();
  const targetYear = String(year);

  // Headers: ID, Date, Opponent, JankenConfirmed
  for (let i = 1; i < mRows.length; i++) {
    const matchDate = new Date(mRows[i][1]);
    const matchYear = String(matchDate.getFullYear());
    
    if (matchYear === targetYear) {
      matchesData.push({
        id: mRows[i][0],
        date: mRows[i][1],
        opponent: mRows[i][2],
        jankenConfirmed: mRows[i][3]
      });
    }
  }
  
  return matchesData;
}

// Helper to setup sheets if empty
function setup() {
  const doc = SpreadsheetApp.getActiveSpreadsheet();
  if (!doc.getSheetByName('Attendance')) {
    const s = doc.insertSheet('Attendance');
    s.appendRow(['MatchID', 'MemberName', 'Status', 'GuestsMain', 'GuestsBack', 'LastUpdated', 'BigFlag']);
  } else {
    // Ensure BigFlag column exists
    const s = doc.getSheetByName('Attendance');
    const headers = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
    if (headers.length < 7) {
        s.getRange(1, 7).setValue('BigFlag');
    }
    if (headers.length < 8) {
        s.getRange(1, 8).setValue('JankenParticipate');
    }
    if (headers.length < 9) {
        s.getRange(1, 9).setValue('MorningWithdraw');
    }
  }
  if (!doc.getSheetByName('Matches')) {
    const s = doc.insertSheet('Matches');
    s.appendRow(['ID', 'Date', 'Opponent', 'JankenConfirmed']);
  }
  if (!doc.getSheetByName('Members')) {
    const s = doc.insertSheet('Members');
    s.appendRow(['Name', 'Section']);
  }
  if (!doc.getSheetByName('Settings')) {
    const s = doc.insertSheet('Settings');
    s.appendRow(['Key', 'Value']);
    s.appendRow(['matchLimit', '10']);
  }
  
  // Ensure default admin password is set
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PASSWORD')) {
    props.setProperty('ADMIN_PASSWORD', 'boa');
  }
}

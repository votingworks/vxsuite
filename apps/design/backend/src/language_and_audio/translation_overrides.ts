import { LanguageCode, NonEnglishLanguageCode } from '@votingworks/types';

export type TranslationOverrides = Record<
  NonEnglishLanguageCode,
  { [englishText: string]: string | undefined }
>;

/**
 * Cloud translations are sometimes incorrect and need to be globally overridden.
 */
export const GLOBAL_TRANSLATION_OVERRIDES: TranslationOverrides = {
  [LanguageCode.CHINESE_SIMPLIFIED]: {},
  [LanguageCode.CHINESE_TRADITIONAL]: {},
  [LanguageCode.SPANISH]: {
    'Green Party': 'Partido Verde',
    '10% volume': '10% de volumen',
    '20% volume': '20% de volumen',
    '30% volume': '30% de volumen',
    '40% volume': '40% de volumen',
    '50% volume': '50% de volumen',
    '60% volume': '60% de volumen',
    '70% volume': '70% de volumen',
    '80% volume': '80% de volumen',
    '90% volume': '90% de volumen',
    'Maximum volume': 'Volumen máximo',
    'Minimum volume': 'Volumen mínimo',
    '"Move"': '"Mover"',
    '"Select"': '"Seleccionar"',
    Accept: 'Aceptar',
    'add write-in candidate': 'agregar candidato por escrito',
    'Mute Audio': 'Silenciar audio',
    'Unmute Audio': 'Activar audio',
    Back: 'Atrás',
    'My Ballot is Correct': 'Mi boleta es correcta',
    'My Ballot is Incorrect': 'Mi boleta es incorrecta',
    'Press the select button to change your votes for this contest.':
      'Presione el botón de selección para cambiar sus votos para este concurso.',
    'Skip Identification': 'Saltar Identificación',
    Cancel: 'Cancelar',
    'Cast Ballot As Is': 'Voto emitido tal como está',
    Change: 'Cambio',
    Close: 'Cerrar',
    'Continue with Voting': 'Continúe con la votación',
    Done: 'Hecho',
    'Enable Audio-Only Mode': 'Habilite el modo de solo audio',
    'Exit Audio-Only Mode': 'Salga del modo de solo audio',
    More: 'Más',
    Next: 'Siguiente',
    No: 'No',
    Okay: 'Ok',
    'Print My Ballot': 'Imprimir mi boleta',
    Reset: 'Reiniciar',
    'Return Ballot': 'Devolver la boleta',
    'Return to Ballot Review': 'Volver a la revisión de la boleta',
    Review: 'Revisar',
    'Start Voting': 'Empezar a votar',
    'Yes, I’m still voting.': 'Sí, todavía estoy votando.',
    'View contests': 'Ver concursos',
    Settings: 'Configuraciones',
    Yes: 'Sí',
    'Yes, Cast Ballot As Is': 'Sí, emita su voto tal cual',
    'This is the Down button, for focusing on the next item in a list of options on a page. You can use the Up and Down buttons to move through candidates in a contest.':
      'Este es el botón Abajo, para centrarse en el siguiente elemento de una lista de opciones en una página. Usted puede utilizar los botones Arriba y Abajo para desplazarse por los candidatos de un concurso.',
    'This is the Up button, for focusing on the previous item in a list of options on a page. You can use the Up and Down buttons to move through candidates in a contest.':
      'Este es el botón Arriba, para centrarse en el elemento anterior en una lista de opciones en una página. Puede utilizar los botones Arriba y Abajo para desplazarse entre los candidatos en un concurso.',
    'This is the Right button, for moving to the next page or contest. You can use the Left and Right buttons to move through all the contests on your ballot.':
      'Este es el botón derecho, para pasar a la siguiente página o concurso. Puede utilizar los botones Izquierda y Derecha para desplazarse por todas las contiendas en su boleta.',
    'This is the Left button, for returning to the previous page or contest. You can use the Left and Right buttons to move through all the contests on your ballot.':
      'Este es el botón izquierdo, para regresar al página anterior o concurso. Puede utilizar los botones Izquierda y Derecha para desplazarse por todas las contiendas en su boleta.',
    'This button reduces the playback rate of the text-to-speech audio.':
      'Este botón reduce la velocidad de reproducción del audio de texto a voz.',
    'This button increases the playback rate of the text-to-speech audio.':
      'Este botón aumenta la velocidad de reproducción del audio de texto a voz.',
    'This is the Select button. Use this button to mark your vote for a candidate or a yes or no option. Pressing the Select button again will remove your previous vote.':
      'Este es el botón Seleccionar. Utilice este botón para marque su voto por un candidato o una opción de sí o no. Al presionar el botón Seleccionar nuevamente se eliminará su voto anterior.',
    'This is the Help button. Press this button again to return to filling out your ballot.':
      'Este es el botón Ayuda. Presione este botón nuevamente para volver a completar su boleta.',
    'This is the Pause button. Use this button to pause the text-to-speech audio. Pressing the Pause button again will resume the text-to-speech audio.':
      'Este es el botón Pausa. Utilice este botón para pausar el audio de texto a voz. Al presionar nuevamente el botón Pausa se reanudará el audio de texto a voz.',
    'This button reduces the volume of the text-to-speech audio.':
      'Este botón reduce el volumen del audio de texto a voz.',
    'This button increases the volume of the text-to-speech audio.':
      'Este botón aumenta el volumen del audio de texto a voz.',
    'Please ask a poll worker for help.':
      'Por favor pida ayuda a un trabajador electoral.',
    'Please ask a poll worker to plug in the power cord.':
      'Pídale a un trabajador electoral que conecte la corriente. cable.',
    'Press the select button to mute all audio.':
      'Presione el botón de selección para silenciar todo el audio.',
    'When voting with the text-to-speech audio, use the accessible controller to navigate your ballot. To navigate through the contests, use the left and right buttons. To navigate through contest choices, use the up and down buttons. To select or unselect a contest choice as your vote, use the select button. Press the right button now to advance to the first contest.':
      'Cuando vote con audio de texto a voz, utilice el controlador accesible para navegar por su boleta. Para navegar por los concursos, utilice los botones izquierdo y derecho. Para navegar por las opciones del concurso, utilice los botones arriba y abajo.',
    'When voting with the text-to-speech audio, use the accessible controller to navigate your ballot. There are four navigation arrow buttons located near the center of the controller. To navigate through the contests, use the left and right arrows. To navigate through contest choices, use the up and down arrows. To select or unselect a contest choice as your vote, use the circle Select button to the right of the navigation buttons. You can find two volume controls at the top right corner of the controller. The minus button reduces the volume of your audio and the plus button increases the volume. To change the speech rate of your audio, use the two buttons at the bottom right corner of the controller. The down arrow button reduces the speech rate and the up arrow button increases it. To pause or unpause the audio at any time, use the pause button at the bottom left corner of the controller. If you need more information on how to use the controller, press the question mark button at the top left corner at any time. To repeat any content, navigate back to previous content using the up or left arrows. Press the right button now to advance to the first contest.':
      'Cuando vote con audio de texto a voz, utilice el controlador accesible para navegar por su boleta. Hay cuatro botones de flecha de navegación ubicados cerca del centro del controlador. Para navegar por las opciones del concurso, utilice las flechas hacia arriba y hacia abajo. Para seleccionar o anular la selección de una opción de concurso como su voto, use el botón circular Seleccionar a la derecha de los botones de navegación. Puede encontrar dos controles de volumen en la esquina superior derecha del controlador. El botón menos reduce el volumen de su audio y el botón más aumenta el volumen. Para cambiar la velocidad de voz de su audio, use los dos botones en la esquina inferior derecha del controlador. El botón de flecha hacia abajo reduce la velocidad del habla y el botón de flecha hacia arriba la aumenta. Para pausar o reanudar el audio en cualquier momento, use el botón de pausa en la esquina inferior izquierda del controlador. Si necesita más información sobre cómo usar el controlador, presione el botón del signo de interrogación en la esquina superior izquierda en cualquier momento. Para repetir cualquier contenido, regrese al contenido anterior usando las flechas hacia arriba o hacia la izquierda. Pulse el botón derecho ahora para avanzar al primer concurso.',
    'Your official ballot is printing. Complete the following steps to finish voting:':
      'Su boleta oficial se está imprimiendo. Complete los siguientes pasos para terminar de votar:',
    'Your official ballot has been removed from the printer. Complete the following steps to finish voting:':
      'Su boleta oficial ha sido eliminada de la impresora. Complete los siguientes pasos para terminar de votar:',
    '1. Verify your official ballot.': '1. Verifique su boleta oficial.',
    '2. Scan your official ballot.': '2. Escanee su boleta oficial.',
    'To navigate through the contest choices, use the down button. To move to the next contest, use the right button.':
      'Para navegar por las opciones del concurso, utilice el botón hacia abajo. Para pasar al siguiente concurso, utilice el botón derecho.',
    "Press any button on the controller to learn what it is and how to use it. When you're done, press the question mark shaped “Help” button at the top left corner of the controller again to return to your ballot.":
      'Presione cualquier botón en el controlador para aprender qué es y cómo utilizarlo. Cuando haya terminado, presione nuevamente el botón "Ayuda" con forma de signo de interrogación en la esquina superior izquierda del controlador para regresar a su boleta.',
    'You have indicated your ballot needs changes. Please alert a poll worker to invalidate the incorrect ballot sheet.':
      'Ha indicado que su boleta necesita cambios. Por favor, avise a un trabajador electoral para que invalide la boleta incorrecta.',
    'Please alert a poll worker to clear the jam.':
      'Por favor avise a un trabajador electoral para que elimine el atasco.',
    'You may continue with voting or go back to the previous screen.':
      'Puede continuar con la votación o volver a la pantalla anterior.',
    'Trigger any input to continue.':
      'Active cualquier entrada para continuar.',
    'Trigger the input again to continue.':
      'Active la entrada nuevamente para continuar.',
    'Try an input to continue.': 'Pruebe una entrada para continuar.',
    'Try the other input.': 'Pruebe la otra entrada.',
    'To change your vote in any contest, use the select button to navigate to that contest. When you are finished making your ballot selections and ready to print your ballot, use the right button to print your ballot.':
      'Para cambiar su voto en cualquier concurso, utilice el botón Seleccionar para navegar a ese concurso. Cuando haya terminado de hacer sus selecciones de boleta y esté listo para imprimir su boleta, use el botón derecho para imprimir su boleta.',
    'To review your votes, advance through the ballot contests using the up and down buttons.':
      'Para revisar sus votos, avance por las contiendas de boletas usando los botones arriba y abajo.',
    'If your selections are correct, press the Right button to confirm your choices and cast your ballot. If there is an error, press the Left button to mark this ballot as incorrect and alert a poll worker.':
      'Si sus selecciones son correctas, presione el botón Derecha para confirmar sus elecciones y emitir su voto. Si hay un error, presione el botón izquierdo para marcar esta boleta como incorrecta y alertar a un trabajador electoral.',
    'Press the select button to continue.':
      'Presione el botón de selección para continuar.',
    'Use the up and down buttons to navigate between the letters of a standard keyboard. Use the select button to select the current letter.':
      'Utilice los botones arriba y abajo para navegar entre las letras de un teclado estándar. Utilice el botón de selección para seleccionar la letra actual.',
    "Use the up and down buttons to navigate through the available ballot languages. To select a language, use the select button. When you're done, use the right button to continue voting.":
      'Utilice los botones arriba y abajo para navegar por los idiomas de votación disponibles. Para seleccionar un idioma, utilice el botón de selección. Cuando hayas terminado, utiliza el botón derecho para continuar votando.',
    'Ask a poll worker to restart the scanner.':
      'Pídale a un trabajador electoral que reinicie el escáner.',
    'Scan one ballot sheet at a time.': 'Escanee una boleta a la vez.',
    'Remove ballot to continue.': 'Retire la boleta para continuar.',
    'Remove your ballot and insert one sheet at a time.':
      'Retire su boleta e inserte una hoja a la vez.',
    'All Precincts': 'Todos los recintos',
    'Ballot style:': 'Estilo de votación:',
    'Input Identified:': 'Entrada identificada:',
    'Input Triggered:': 'Entrada activada:',
    'Number of seconds remaining:': 'Número de segundos restantes:',
    'Enter the name of a person who is <1>not</1> on the ballot:':
      'Introduzca el nombre de una persona que <1>no</1> en la boleta:',
    'Characters remaining:': 'Personajes restantes:',
    'Contest number:': 'Número de concurso:',
    'Contests remaining:': 'Concursos restantes:',
    'Contests with no votes marked:': 'Concursos sin votos marcados:',
    'Contests with too many votes marked:':
      'Concursos con demasiados votos marcados:',
    'Contests with one or more votes remaining:':
      'Concursos con uno o más votos restantes:',
    'Deselected:': 'Deseleccionados:',
    'Deselected option:': 'Opción deseleccionada:',
    'VOTE FOR APPROVAL OF EITHER, OR AGAINST BOTH':
      'VOTE POR LA APROBACIÓN DE CUALQUIER O CONTRA AMBOS',
    'AND VOTE FOR ONE': 'Y VOTA POR UNO',
    delete: 'eliminar',
    space: 'espacio',
    'Number of contests on your ballot:': 'Número de contiendas en su boleta:',
    'Ballots Scanned': 'Boletas escaneadas',
    'Votes remaining in this contest:': 'Votos restantes en este concurso:',
    'Number of unused votes:': 'Número de votos no utilizados:',
    'Selected:': 'Seleccionados:',
    'Selected option:': 'Opción seleccionada:',
    'White text, black background': 'Texto blanco, fondo negro',
    'Black text, white background': 'Texto negro, fondo blanco',
    'Gray text, dark background': 'Texto gris, fondo oscuro',
    'Dark text, light background': 'Texto oscuro, fondo claro',
    'Extra-Large': 'Extra grande',
    Large: 'Grande',
    Medium: 'Medio',
    Small: 'Pequeño',
    'Total contests:': 'Concursos totales:',
    'Write-In Candidate': 'Candidato por escrito',
    '(write-in)': '(por escrito)',
    'Write-In': 'Escribir en',
    'Write-In:': 'Escribir en:',
    'Ask a poll worker if you need help.':
      'Pregúntele a un trabajador electoral si necesita ayuda.',
    'No Selection': 'Sin selección',
    'A poll worker must empty the full ballot box.':
      'Un trabajador electoral debe vaciar la boleta completa caja.',
    'The ballot sheet has been loaded. You will have a chance to review your selections before reprinting your ballot.':
      'La papeleta ha sido cargada. Vas a tener la oportunidad de revisar sus selecciones antes de reimprimir su boleta.',
    'Casting Ballot...': 'Emitir voto...',
    'Clearing ballot': 'Boleta de limpieza',
    'First, vote "for either" or "against both". Then select your preferred measure.':
      'Primero, vote "a favor de cualquiera de los dos" o "en contra de ambos". Luego seleccione su medida preferida.',
    'You have selected "for either". <2>Now select your preferred measure.</2>':
      'Ha seleccionado "para cualquiera de los dos". <2>Ahora seleccione tu medida preferida. </2>',
    'You have selected "for either" and your preferred measure.':
      'Ha seleccionado "para cualquiera" y su medida preferida.',
    'You have selected "against both". <2>You may additionally select your preferred measure.</2>':
      'Ha seleccionado "contra ambos". <2>También puede seleccionar su medida preferida. </2>',
    'You have selected "against both" and your preferred measure.':
      'Ha seleccionado "contra ambos" y su medida preferida.',
    'You have selected your preferred measure. <2>Now vote "for either" or "against both".</2>':
      'Has seleccionado tu medida preferida. <2>Ahora vote "a favor de cualquiera de los dos" o "en contra de ambos". </2>',
    'The hardware has been reset.': 'El hardware ha sido reiniciado.',
    'The hardware is resetting.': 'El hardware se está reiniciando.',
    'There was a problem interpreting your ballot.':
      'Hubo un problema al interpretar su votación.',
    "Your device's two inputs can be used to <1>Move</1> focus between two items on the screen and <5>Select</5> an item.":
      'Las dos entradas de su dispositivo se pueden utilizar para <1>Mover</1> el foco entre dos elementos en la pantalla y <5>Seleccionar</5> un elemento.',
    'Step 1 of 3': 'Paso 1 de 3',
    'Step 2 of 3': 'Paso 2 de 3',
    'Step 3 of 3': 'Paso 3 de 3',
    'Please ask a poll worker to load a new ballot sheet.':
      'Pídale a un trabajador electoral que cargue un nuevo hoja de votación.',
    'Your voting session will restart shortly.':
      'Su sesión de votación se reiniciará en breve.',
    'Did you mean to leave these contests blank?':
      '¿Quería dejar estos concursos en blanco?',
    'Did you mean to leave this contest blank?':
      '¿Quería dejar este concurso en blanco?',
    'Your votes in these contests will not be counted.':
      'Sus votos en estos concursos no serán contado.',
    'Your votes in this contest will not be counted.':
      'Sus votos en este concurso no serán contado.',
    'A poll worker must replace the full ballot bag with a new empty ballot bag.':
      'Un trabajador electoral debe reemplazar la bolsa de boletas llena con una nueva bolsa de boletas vacía.',
    'Scanning the marks on your ballot.': 'Escaneando las marcas en su boleta.',
    'All other votes in these contests will count, even if you leave some blank.':
      'Todos los demás votos en estas contiendas contarán, incluso si deja algunos en blanco.',
    'All other votes in this contest will count, even if you leave some blank.':
      'Todos los demás votos en este concurso contarán, incluso si deja algunos en blanco.',
    'Thank you for voting.': 'Gracias por votar.',
    'Audio is muted': 'El audio está silenciado',
    'Audio is on': 'El audio está en',
    'Do you want to deselect and remove your write-in candidate?':
      '¿Quieres anular la selección y eliminar tu candidato por escrito?',
    'Press the select button to confirm sound is working.':
      'Presione el botón de selección para confirmar que el sonido está funcionando.',
    'Audio-Only Mode is Enabled': 'El modo de solo audio está habilitado',
    'Ballot Bag Full': 'Bolsa de boletas llena',
    'Ballot Box Full': 'Urna llena',
    'Ballot ID': 'Identificación de la boleta',
    'Ballot Style': 'Estilo de boleta',
    'Your ballot was cast!': '¡Su voto fue emitido!',
    'Ask a Poll Worker for Help': 'Pida ayuda a un trabajador electoral',
    'You’re Almost Done': 'Ya casi has terminado',
    'Are you still voting?': '¿Sigue votando?',
    'Jam Cleared': 'Atasco despejado',
    'Paper is Jammed': 'El papel está atascado',
    'Device Inputs Identified': 'Entradas de dispositivo identificadas',
    'Personal Assistive Technology Device Identification':
      'Identificación de dispositivos de tecnología de asistencia personal.',
    'Identify the "Move" Input': 'Identifique la entrada "Mover"',
    'Identify the "Select" Input': 'Identifique la entrada "Seleccionar"',
    'Test Your Device': 'Pruebe su dispositivo',
    'Printing Your Official Ballot...': 'Imprimir su boleta oficial...',
    'Ready to Review': 'Listo para revisar',
    'Review Your Votes': 'Revise sus votos',
    'Internal Connection Problem': 'Problema de conexión interna',
    'Select Your Ballot Language': 'Seleccione el idioma de su boleta',
    'Are you sure?': '¿Está seguro?',
    'No Power Detected': 'No se detectó energía',
    'Official Ballot': 'Boleta Oficial',
    Precinct: 'Recinto',
    'Remove Your Ballot': 'Retire su boleta',
    'Ballot Not Counted': 'Boleta no contada',
    'Review Your Ballot': 'Revise su boleta',
    'Scanner Cover is Open': 'La cubierta del escáner está abierta',
    'Insert Your Ballot': 'Inserte su boleta',
    'No votes marked:': 'Sin votos marcados:',
    'Too many votes marked:': 'Demasiados votos marcados:',
    'Please wait…': 'Espere por favor…',
    'Your ballot was counted!': '¡Su voto fue contado!',
    'You may add one or more votes:': 'Se pueden sumar uno o más votos:',
    'Scanning Failed': 'Error de escaneo',
    'Unofficial TEST Ballot': 'Boleta de PRUEBA no oficial',
    'Settings:': 'Configuraciones:',
    Audio: 'Audio',
    Color: 'Color',
    'Text Size': 'Tamaño del texto',
    'This voting station has been inactive for more than 5 minutes.':
      'Esta mesa de votación ha estado inactiva por más de 5 minutos.',
    'To protect your privacy, this ballot will be cleared when the timer runs out.':
      'Para proteger su privacidad, esta boleta se borrará cuando se acabe el tiempo.',
    '<0>No Power Detected.</0> Please ask a poll worker to plug in the power cord.':
      '<0>No se detectó energía. </0> Pídale a un trabajador electoral que enchufe el cable de alimentación.',
    'You may still vote in this contest.': 'Aún puedes votar en este concurso.',
    'To vote for another candidate, you must first deselect a previously selected candidate.':
      'Para votar por otro candidato, debe primero anular la selección de un candidato previamente seleccionado.',
    'To change your vote, first deselect your previous vote.':
      'Para cambiar su voto, primero anule la selección de su voto anterior.',
    'There was a problem scanning this ballot.':
      'Hubo un problema al escanear esta boleta.',
    'There was a problem scanning your ballot. Please scan it again.':
      'Hubo un problema al escanear su boleta. Escanéelo nuevamente.',
    'Another ballot is being scanned.': 'Se está escaneando otra boleta.',
    'No votes will be counted from this ballot.':
      'No se contarán votos de esta votación.',
    'The ballot is jammed in the scanner.':
      'La boleta está atascada en el escáner.',
    'The scanner is in test mode and a live ballot was detected.':
      'El escáner está en modo de prueba y en vivo. se detectó la boleta.',
    'The ballot does not match the election this scanner is configured for.':
      'La boleta no coincide con la elección de este está configurado el escáner.',
    'The ballot does not match the precinct this scanner is configured for.':
      'La boleta no coincide con el distrito electoral para el que está configurado este escáner.',
    'Multiple sheets detected.': 'Se detectaron varias hojas.',
    'No votes were found when scanning this ballot.':
      'No se encontraron votos al escanear esto votación.',
    'The scanner is in live mode and a test ballot was detected.':
      'El escáner está en modo en vivo y se detectó una boleta.',
  },
};

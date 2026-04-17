import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      common: {
        live: 'live',
        na: 'N/A',
        online: 'Online',
      },
      header: {
        logoAlt: 'CrowdShield logo',
        subtitle: 'Crowd Management System',
        languageToggleAria: 'Toggle language',
        switchToEnglish: 'English',
        switchToMarathi: 'मराठी',
      },
      status: {
        backendOffline: 'Backend Offline',
        syncing: 'Syncing...',
        allOkay: 'All Okay!',
      },
      sections: {
        keyMetrics: 'Key Metrics',
        alertLog: 'Alert Log',
        mapPreview: 'Map preview',
        cameraFeed: 'Camera Feed',
        cameraFeeds: 'Camera feeds',
      },
      mainPlace: {
        label: 'Main Place',
        name: 'Dagdusheth Temple',
      },
      metrics: {
        liveCount: 'Live Count',
        hotspot: 'Hotspot',
        system: 'System',
        awaitingModelUpdate: 'Awaiting model update',
      },
      alerts: {
        pending: 'Alert update pending',
        defaultCritical: 'Critical alert at Shivajinagar Hub - 9 min ago',
        defaultModerate: 'Moderate surge at Swargate Junction - 21 min ago',
        defaultSafe: 'Flow stabilized near Sarasbaug Access - 37 min ago',
      },
      camera: {
        details: 'Camera details',
        closeDetails: 'Close camera details',
        count: 'Count',
        emotion: 'Emotion',
        emotionBreakdown: 'Emotion breakdown',
        noEmotionScores: 'No emotion scores from model.',
        locationDetails: 'Location Details',
      },
      cameraNames: {
        cam1: 'cam1',
        cam2: 'cam2',
        cam3: 'cam3',
        cam4: 'cam4',
        cam5: 'cam5',
        cam6: 'cam6',
      },
      emotion: {
        calm: 'Calm',
        neutral: 'Neutral',
        anxious: 'Anxious',
        panic: 'Panic',
      },
      location: {
        unavailable: 'Location details unavailable.',
        cam1: 'East gate approach lane, Dagdusheth Temple perimeter.',
        cam2: 'North barricade checkpoint near vendor corridor.',
        cam3: 'South lane queue spillover near utility gate.',
        cam4: 'Inner ring walkway near barricade turn.',
        cam5: 'Vendor-side corridor near hydration point.',
        cam6: 'Temple exit merge lane near crowd diversion rope.',
      },
      map: {
        fallbackTitle: 'Live Command Map',
        fallbackSubtitle: 'Mapbox token missing. Add VITE_MAPBOX_TOKEN in your environment file.',
        unknownZone: 'Heatmap Zone',
        popupRiskLabel: 'Risk',
        popupScoreLabel: 'Score',
        popupLocationLabel: 'Location',
        popupExitPointLabel: 'Exit Point',
        mainGateName: 'Main Gate',
        mainGateDescription: 'ML-configured entry point',
        risk: {
          veryHigh: 'VERY HIGH',
          moderate: 'MODERATE',
          low: 'LOW',
        },
        zoneNames: {
          shivajinagar: 'Shivajinagar Hub',
          swargate: 'Swargate Junction',
          puneStation: 'Pune Station Gate',
          deccan: 'Deccan Square',
          sarasbaug: 'Sarasbaug Access',
        },
        routeNames: {
          route1: 'Route 1 (Western Exit)',
          route2: 'Route 2 (Northern Exit)',
          route3: 'Route 3 (Eastern Exit)',
          route4: 'Route 4 (South-Western Exit)',
        },
        exitNames: {
          laxmiRoad: 'Laxmi Road',
          mamledarKacheri: 'Mamledar Kacheri',
          subhanshahDargah: 'Subhanshah Dargah (Raviwar Peth)',
          perugate: 'Perugate',
        },
      },
      chat: {
        openAssistant: 'Open assistant',
        notConnectedHint: 'Chatbot not connected yet. Integrate by calling registerChatLauncher(openFn).',
      },
    },
  },
  mr: {
    translation: {
      common: {
        live: 'लाइव्ह',
        na: 'लागू नाही',
        online: 'ऑनलाइन',
      },
      header: {
        logoAlt: 'क्राउडशिल्ड लोगो',
        subtitle: 'गर्दी व्यवस्थापन प्रणाली',
        languageToggleAria: 'भाषा बदला',
        switchToEnglish: 'English',
        switchToMarathi: 'मराठी',
      },
      status: {
        backendOffline: 'बॅकएंड ऑफलाइन',
        syncing: 'समक्रमित होत आहे...',
        allOkay: 'सर्व ठीक आहे!',
      },
      sections: {
        keyMetrics: 'मुख्य मेट्रिक्स',
        alertLog: 'अलर्ट नोंद',
        mapPreview: 'नकाशा पूर्वावलोकन',
        cameraFeed: 'कॅमेरा फीड',
        cameraFeeds: 'कॅमेरा फीड्स',
      },
      mainPlace: {
        label: 'मुख्य स्थान',
        name: 'दगडूशेठ मंदिर',
      },
      metrics: {
        liveCount: 'सद्य संख्या',
        hotspot: 'हॉटस्पॉट',
        system: 'प्रणाली',
        awaitingModelUpdate: 'मॉडेल अद्यतनाची प्रतीक्षा...',
      },
      alerts: {
        pending: 'अलर्ट अद्यतन प्रलंबित',
        defaultCritical: 'शिवाजीनगर हब येथे गंभीर अलर्ट - ९ मिनिटांपूर्वी',
        defaultModerate: 'स्वारगेट जंक्शन येथे मध्यम वाढ - २१ मिनिटांपूर्वी',
        defaultSafe: 'सरसबाग परिसरातील प्रवाह स्थिर - ३७ मिनिटांपूर्वी',
      },
      camera: {
        details: 'कॅमेरा तपशील',
        closeDetails: 'कॅमेरा तपशील बंद करा',
        count: 'संख्या',
        emotion: 'भावना',
        emotionBreakdown: 'भावना विश्लेषण',
        noEmotionScores: 'मॉडेलकडून भावना स्कोअर उपलब्ध नाहीत.',
        locationDetails: 'स्थान तपशील',
      },
      cameraNames: {
        cam1: 'कॅम १',
        cam2: 'कॅम २',
        cam3: 'कॅम ३',
        cam4: 'कॅम ४',
        cam5: 'कॅम ५',
        cam6: 'कॅम ६',
      },
      emotion: {
        calm: 'शांत',
        neutral: 'तटस्थ',
        anxious: 'चिंताग्रस्त',
        panic: 'घाबरलेले',
      },
      location: {
        unavailable: 'स्थान तपशील उपलब्ध नाहीत.',
        cam1: 'पूर्व प्रवेशद्वाराजवळील मार्ग, दगडूशेठ मंदिर परिसर.',
        cam2: 'उत्तरेकडील बॅरिकेड तपासणी बिंदू, विक्रेता मार्गाजवळ.',
        cam3: 'दक्षिण मार्गावरील रांग वाढ, युटिलिटी गेटजवळ.',
        cam4: 'आतील वर्तुळाकार पायवाट, बॅरिकेड वळणाजवळ.',
        cam5: 'विक्रेता बाजूचा मार्ग, पाणी केंद्राजवळ.',
        cam6: 'मंदिर बाहेर पडणारा एकत्रीकरण मार्ग, गर्दी वळविणाऱ्या दोरीजवळ.',
      },
      map: {
        fallbackTitle: 'लाईव्ह कमांड नकाशा',
        fallbackSubtitle: 'Mapbox टोकन सापडले नाही. आपल्या environment फाइलमध्ये VITE_MAPBOX_TOKEN जोडा.',
        unknownZone: 'उष्णता नकाशा विभाग',
        popupRiskLabel: 'जोखीम',
        popupScoreLabel: 'स्कोअर',
        popupLocationLabel: 'स्थान',
        popupExitPointLabel: 'निर्गमन बिंदू',
        mainGateName: 'मुख्य प्रवेशद्वार',
        mainGateDescription: 'ML संरचीत प्रवेश बिंदू',
        risk: {
          veryHigh: 'अतिशय जास्त',
          moderate: 'मध्यम',
          low: 'कमी',
        },
        zoneNames: {
          shivajinagar: 'शिवाजीनगर हब',
          swargate: 'स्वारगेट जंक्शन',
          puneStation: 'पुणे स्टेशन प्रवेशद्वार',
          deccan: 'डेक्कन चौक',
          sarasbaug: 'सरसबाग प्रवेश',
        },
        routeNames: {
          route1: 'मार्ग १ (पश्चिम निर्गमन)',
          route2: 'मार्ग २ (उत्तर निर्गमन)',
          route3: 'मार्ग ३ (पूर्व निर्गमन)',
          route4: 'मार्ग ४ (दक्षिण-पश्चिम निर्गमन)',
        },
        exitNames: {
          laxmiRoad: 'लक्ष्मी रोड',
          mamledarKacheri: 'मामलेदार कचेरी',
          subhanshahDargah: 'सुभानशाह दर्गाह (रविवार पेठ)',
          perugate: 'पेरूगेट',
        },
      },
      chat: {
        openAssistant: 'सहाय्यक उघडा',
        notConnectedHint: 'चॅटबॉट अजून जोडलेला नाही. registerChatLauncher(openFn) कॉल करून जोडणी करा.',
      },
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;

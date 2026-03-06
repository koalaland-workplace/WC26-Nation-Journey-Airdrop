import { PrismaClient } from "@prisma/client";
import { authenticator } from "otplib";

const prisma = new PrismaClient();

async function main() {
  const ownerSecret = authenticator.generateSecret();
  const adminSecret = authenticator.generateSecret();

  await prisma.boardMember.upsert({
    where: { telegramId: "10000001" },
    update: {},
    create: {
      telegramId: "10000001",
      username: "wc26_owner",
      displayName: "Owner",
      role: "owner",
      requiresTotp: true,
      totpSecret: ownerSecret
    }
  });

  await prisma.boardMember.upsert({
    where: { telegramId: "10000002" },
    update: {},
    create: {
      telegramId: "10000002",
      username: "wc26_admin",
      displayName: "Admin",
      role: "admin",
      requiresTotp: true,
      totpSecret: adminSecret
    }
  });

  await prisma.boardMember.upsert({
    where: { telegramId: "10000003" },
    update: {},
    create: {
      telegramId: "10000003",
      username: "wc26_mod",
      displayName: "Moderator",
      role: "moderator",
      requiresTotp: false
    }
  });

  await prisma.appUser.createMany({
    data: [
      { telegramId: "20000001", username: "samba_fc", nationCode: "BR", kick: 482100, status: "vip" },
      { telegramId: "20000002", username: "amir_88", nationCode: "AR", kick: 374500, status: "active" },
      { telegramId: "20000003", username: "footballking", nationCode: "FR", kick: 291000, status: "active" }
    ],
    skipDuplicates: true
  });

  const users = await prisma.appUser.findMany({
    where: { username: { in: ["samba_fc", "amir_88", "footballking"] } }
  });
  const userByName = new Map(users.map((u) => [u.username ?? "", u]));

  await prisma.featureConfig.upsert({
    where: { key: "spin" },
    update: {},
    create: {
      key: "spin",
      value: {
        dailyCap: 5,
        rewards: [
          { id: "k50", chance: 30, value: 50 },
          { id: "k100", chance: 25, value: 100 },
          { id: "k200", chance: 10, value: 200 },
          { id: "q2x", chance: 10, value: 2 }
        ]
      }
    }
  });

  await prisma.featureConfig.upsert({
    where: { key: "penalty" },
    update: {},
    create: {
      key: "penalty",
      value: {
        soloFreePerDay: 3,
        soloExtraCost: 500,
        soloWin: 2000,
        pvpWin: 2000,
        pvpLose: -2500,
        pvpBurn: 500
      }
    }
  });

  await prisma.featureConfig.upsert({
    where: { key: "api" },
    update: {},
    create: {
      key: "api",
      value: {
        footballNews: {
          enabled: false,
          provider: "api-football",
          baseUrl: "https://v3.football.api-sports.io",
          apiKey: "",
          keyHeader: "x-apisports-key",
          endpoints: {
            news: "/news",
            fixtures: "/fixtures"
          },
          defaults: {
            competitions: ["FIFA-WC"],
            language: "en",
            timezone: "UTC"
          },
          polling: {
            intervalMinutes: 10,
            timeoutMs: 12000
          }
        }
      }
    }
  });

  await prisma.featureConfig.upsert({
    where: { key: "referrals" },
    update: {},
    create: {
      key: "referrals",
      value: {
        f1Register: 200,
        f1Active7d: 500,
        f2Register: 50,
        f2Active7d: 100,
        maxF1PerSeason: 50
      }
    }
  });

  const referralCount = await prisma.referralEvent.count();
  if (referralCount === 0) {
    const footballking = userByName.get("footballking");
    const amir = userByName.get("amir_88");
    const samba = userByName.get("samba_fc");
    if (footballking && amir && samba) {
      await prisma.referralEvent.createMany({
        data: [
          {
            inviterUserId: footballking.id,
            invitedUserId: amir.id,
            level: 1,
            status: "active_7d",
            season: "S1",
            kickAward: 700,
            riskScore: 5
          },
          {
            inviterUserId: footballking.id,
            invitedUserId: samba.id,
            level: 2,
            status: "registered",
            season: "S1",
            kickAward: 50,
            riskScore: 8
          },
          {
            inviterUserId: amir.id,
            invitedTelegramId: "20000088",
            level: 1,
            status: "flagged",
            season: "S1",
            kickAward: 200,
            riskScore: 92
          }
        ]
      });
    }
  }

  const matchCount = await prisma.matchFixture.count();
  if (matchCount === 0) {
    await prisma.matchFixture.createMany({
      data: [
        {
          groupCode: "A",
          homeNation: "Brazil",
          awayNation: "Argentina",
          stadium: "Lusail",
          city: "Lusail",
          kickoffAt: new Date("2026-06-15T20:00:00Z"),
          status: "scheduled"
        },
        {
          groupCode: "B",
          homeNation: "France",
          awayNation: "Germany",
          stadium: "MetLife",
          city: "New York",
          kickoffAt: new Date("2026-06-16T20:00:00Z"),
          status: "scheduled"
        },
        {
          groupCode: "C",
          homeNation: "Spain",
          awayNation: "Portugal",
          stadium: "Azteca",
          city: "Mexico City",
          kickoffAt: new Date("2026-06-17T20:00:00Z"),
          status: "scheduled"
        }
      ]
    });
  }

  await prisma.mission.upsert({
    where: { code: "daily_quiz_champion" },
    update: {},
    create: {
      code: "daily_quiz_champion",
      name: "Daily Quiz Champion",
      phase: "Viral Activation",
      category: "daily",
      rewardKick: 500,
      isActive: true
    }
  });

  await prisma.mission.upsert({
    where: { code: "spin_5x" },
    update: {},
    create: {
      code: "spin_5x",
      name: "Spin 5x in One Day",
      phase: "Viral Activation",
      category: "daily",
      rewardKick: 200,
      isActive: true
    }
  });

  await prisma.mission.upsert({
    where: { code: "invite_3_friends" },
    update: {},
    create: {
      code: "invite_3_friends",
      name: "Invite 3 Friends",
      phase: "Viral Activation",
      category: "growth",
      rewardKick: 1500,
      isActive: true
    }
  });

  const progressCount = await prisma.missionProgress.count();
  if (progressCount === 0 && users.length > 0) {
    const missions = await prisma.mission.findMany();
    const missionByCode = new Map(missions.map((m) => [m.code, m]));
    const footballking = userByName.get("footballking");
    const amir = userByName.get("amir_88");
    if (footballking && amir) {
      const quizMission = missionByCode.get("daily_quiz_champion");
      const spinMission = missionByCode.get("spin_5x");
      if (quizMission && spinMission) {
        await prisma.missionProgress.createMany({
          data: [
            {
              missionId: quizMission.id,
              userId: footballking.id,
              status: "completed",
              progress: 100,
              awardedKick: 500
            },
            {
              missionId: spinMission.id,
              userId: amir.id,
              status: "completed",
              progress: 100,
              awardedKick: 200
            }
          ]
        });
      }
    }
  }

  const socialChannelCount = await prisma.socialChannel.count();
  if (socialChannelCount === 0) {
    await prisma.socialChannel.createMany({
      data: [
        {
          platform: "Telegram",
          name: "WC26 Journey Official",
          url: "https://t.me/wc26journey",
          icon: "📱",
          tasks: 3,
          kick: 300,
          sortOrder: 10,
          isActive: true
        },
        {
          platform: "Twitter/X",
          name: "@WC26Journey",
          url: "https://twitter.com/wc26journey",
          icon: "🐦",
          tasks: 4,
          kick: 400,
          sortOrder: 20,
          isActive: true
        },
        {
          platform: "YouTube",
          name: "WC26 Journey",
          url: "https://youtube.com/@wc26journey",
          icon: "▶️",
          tasks: 2,
          kick: 250,
          sortOrder: 30,
          isActive: true
        }
      ]
    });
  }

  const newsCount = await prisma.newsItem.count();
  if (newsCount === 0) {
    await prisma.newsItem.createMany({
      data: [
        {
          provider: "seed",
          providerItemId: "wc26-news-001",
          title: "WC26 host cities finalize opening ceremony preparations",
          summary: "Organizers confirmed final rehearsal plans for the first week of the tournament.",
          url: "https://wc26nft.com/news/wc26-host-cities-opening-ceremony",
          imageUrl: "https://wc26nft.com/assets/news/opening-ceremony.jpg",
          sourceName: "WC26 Newsroom",
          language: "en",
          competition: "FIFA-WC",
          publishedAt: new Date("2026-03-01T08:00:00Z")
        },
        {
          provider: "seed",
          providerItemId: "wc26-news-002",
          title: "Qualification watch: top nations announce final squad shortlist",
          summary: "Several federations released preliminary player lists ahead of warm-up friendlies.",
          url: "https://wc26nft.com/news/qualification-watch-squad-shortlist",
          imageUrl: "https://wc26nft.com/assets/news/squad-shortlist.jpg",
          sourceName: "WC26 Newsroom",
          language: "en",
          competition: "FIFA-WC",
          publishedAt: new Date("2026-03-02T12:30:00Z")
        }
      ],
      skipDuplicates: true
    });
  }

  console.log("Seed completed");
  console.log("Owner TOTP secret:", ownerSecret);
  console.log("Admin TOTP secret:", adminSecret);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
